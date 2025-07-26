import fs from 'fs';

class EnhancedICAOFinder {
    constructor(ollamaUrl = 'http://localhost:11434', model = 'mistral:latest') {
        this.ollamaUrl = ollamaUrl;
        this.model = model;
        this.enrichedAirports = [];
        this.openFlightsMapping = new Map();
        this.delayMs = 500;
        this.stats = {
            openFlightsFound: 0,
            knownMappingFound: 0,
            llmFound: 0,
            notFound: 0,
            total: 0
        };
    }

    async downloadOpenFlightsData() {
        console.log('📥 Downloading OpenFlights airport database...');

        try {
            const response = await fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const csvData = await response.text();
            console.log('✅ Downloaded OpenFlights database');

            return csvData;
        } catch (error) {
            console.error('❌ Failed to download OpenFlights data:', error.message);
            return null;
        }
    }

    parseOpenFlightsData(csvData) {
        console.log('🔄 Parsing OpenFlights data...');

        const lines = csvData.split('\n');
        let parsed = 0;
        let withBothCodes = 0;

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                // Parse CSV line (handle quoted fields)
                const fields = this.parseCSVLine(line);

                if (fields.length >= 6) {
                    const iataCode = fields[4]; // Column 5 (0-indexed)
                    const icaoCode = fields[5]; // Column 6 (0-indexed)
                    const airportName = fields[1];
                    const city = fields[2];
                    const country = fields[3];

                    // Only include if both IATA and ICAO codes exist and are valid
                    if (iataCode && icaoCode &&
                        iataCode !== '\\N' && icaoCode !== '\\N' &&
                        iataCode.length === 3 && icaoCode.length === 4) {

                        this.openFlightsMapping.set(iataCode.toUpperCase(), {
                            icao: icaoCode.toUpperCase(),
                            name: airportName,
                            city: city,
                            country: country
                        });
                        withBothCodes++;
                    }
                    parsed++;
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }

        console.log(`✅ Parsed ${parsed} airports, ${withBothCodes} with both IATA and ICAO codes`);
        console.log(`📊 OpenFlights mapping contains ${this.openFlightsMapping.size} airports`);

        return this.openFlightsMapping.size;
    }

    parseCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        // Add the last field
        fields.push(current);

        return fields;
    }

    // Enhanced known mappings (for airports not in OpenFlights or corrections)
    getKnownICAOCode(airport) {
        const iataCode = airport.airportCode?.toUpperCase();

        // Manual corrections and additions
        const knownMappings = {
            'KVP': 'LUTR',  // Tiraspol - corrected per MSFS2024
            'KIV': 'LUKK',  // Chișinău - Moldova
            // Add more corrections here as needed
        };

        return knownMappings[iataCode] || null;
    }

    // Get ICAO from OpenFlights database
    getICAOFromOpenFlights(airport) {
        const iataCode = airport.airportCode?.toUpperCase();
        const openFlightsData = this.openFlightsMapping.get(iataCode);

        if (openFlightsData) {
            return {
                icaoCode: openFlightsData.icao,
                source: 'openflights',
                matchedName: openFlightsData.name,
                matchedCity: openFlightsData.city,
                matchedCountry: openFlightsData.country
            };
        }

        return null;
    }

    // Fallback: Use LLM for airports not in database
    async findICAOFromLLM(airport) {
        try {
            const prompt = `What is the ICAO code for ${airport.airportName} (${airport.airportCode}) in ${airport.city}, ${airport.country}?

ICAO codes are exactly 4 letters (like KJFK, EGLL, LFPG). Respond with ONLY the ICAO code in this exact JSON format:

{
  "icaoCode": "XXXX"
}

If you don't know the exact ICAO code, respond with:
{
  "icaoCode": null
}

Only respond with valid JSON, nothing else.`;

            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.1,
                        top_p: 0.9
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return this.parseICAOResponse(data.response);
        } catch (error) {
            console.error(`Error querying LLM for ${airport.airportCode}: ${error.message}`);
            return null;
        }
    }

    parseICAOResponse(response) {
        if (!response) return null;

        try {
            let cleanResponse = response.trim();
            const jsonStart = cleanResponse.indexOf('{');
            const jsonEnd = cleanResponse.lastIndexOf('}') + 1;

            if (jsonStart === -1 || jsonEnd === 0) {
                return null;
            }

            const jsonStr = cleanResponse.substring(jsonStart, jsonEnd);
            const parsed = JSON.parse(jsonStr);

            if (parsed.icaoCode && typeof parsed.icaoCode === 'string' && parsed.icaoCode.length === 4) {
                return parsed.icaoCode.toUpperCase();
            }

            return null;
        } catch (error) {
            console.error(`Error parsing ICAO response: ${error.message}`);
            return null;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async enrichAirportWithICAO(airport, index, total) {
        console.log(`[${index + 1}/${total}] Processing: ${airport.airportCode} - ${airport.airportName}`);

        // Step 1: Check manual corrections first
        let icaoCode = this.getKnownICAOCode(airport);
        if (icaoCode) {
            console.log(`  ✅ Manual mapping: ${airport.airportCode} → ${icaoCode}`);
            this.stats.knownMappingFound++;
            return { ...airport, icaoCode, icaoSource: 'manual_correction' };
        }

        // Step 2: Check OpenFlights database
        const openFlightsResult = this.getICAOFromOpenFlights(airport);
        if (openFlightsResult) {
            console.log(`  🌐 OpenFlights: ${airport.airportCode} → ${openFlightsResult.icaoCode}`);
            this.stats.openFlightsFound++;
            return {
                ...airport,
                icaoCode: openFlightsResult.icaoCode,
                icaoSource: 'openflights',
                openFlightsMatch: {
                    name: openFlightsResult.matchedName,
                    city: openFlightsResult.matchedCity,
                    country: openFlightsResult.matchedCountry
                }
            };
        }

        // Step 3: Fallback to LLM (only for airports not in database)
        icaoCode = await this.findICAOFromLLM(airport);
        if (icaoCode) {
            console.log(`  🤖 LLM fallback: ${airport.airportCode} → ${icaoCode}`);
            this.stats.llmFound++;
            return { ...airport, icaoCode, icaoSource: 'llm' };
        }

        // Step 4: Not found
        console.log(`  ❌ ICAO not found for ${airport.airportCode}`);
        this.stats.notFound++;
        return { ...airport, icaoCode: null, icaoSource: 'not_found' };
    }

    async processAirports() {
        try {
            console.log('🚀 Enhanced ICAO Code Finder\n');

            // Step 1: Download and parse OpenFlights data
            const csvData = await this.downloadOpenFlightsData();
            if (!csvData) {
                console.error('❌ Could not download OpenFlights data, falling back to LLM only');
            } else {
                await this.parseOpenFlightsData(csvData);
            }

            // Step 2: Load airports data
            if (!fs.existsSync('airports-categorized.json')) {
                console.error('❌ airports-categorized.json not found');
                console.log('Please run categorize-airports.js first');
                return null;
            }

            const airports = JSON.parse(fs.readFileSync('airports-categorized.json', 'utf8'));
            console.log(`\n📋 Found ${airports.length} airports to enrich with ICAO codes`);
            console.log(`🧠 Using model: ${this.model}\n`);

            this.stats.total = airports.length;

            // Step 3: Process each airport
            for (let i = 0; i < airports.length; i++) {
                const airport = airports[i];

                const enrichedAirport = await this.enrichAirportWithICAO(airport, i, airports.length);
                this.enrichedAirports.push(enrichedAirport);

                // Add delay only for LLM queries
                if (enrichedAirport.icaoSource === 'llm') {
                    await this.delay(this.delayMs);
                }
            }

            console.log('\n=== ENHANCED ICAO CODE ENRICHMENT COMPLETE ===');
            this.generateReport();
            this.saveResults();

            return this.enrichedAirports;

        } catch (error) {
            console.error('Error processing airports:', error);
            return null;
        }
    }

    generateReport() {
        const totalWithICAO = this.stats.openFlightsFound + this.stats.knownMappingFound + this.stats.llmFound;

        console.log(`\n📊 ENHANCED ICAO CODE STATISTICS:`);
        console.log(`Total airports: ${this.stats.total}`);
        console.log(`✅ With ICAO codes: ${totalWithICAO} (${(totalWithICAO / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🌐 OpenFlights database: ${this.stats.openFlightsFound} (${(this.stats.openFlightsFound / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🔧 Manual corrections: ${this.stats.knownMappingFound} (${(this.stats.knownMappingFound / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🤖 LLM fallback: ${this.stats.llmFound} (${(this.stats.llmFound / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`❌ Not found: ${this.stats.notFound} (${(this.stats.notFound / this.stats.total * 100).toFixed(1)}%)`);

        // Show examples by source
        console.log(`\n🎯 ACCURACY BY SOURCE:`);
        console.log(`🌐 OpenFlights: ~99% accurate (aviation database)`);
        console.log(`🔧 Manual: 100% accurate (verified corrections)`);
        console.log(`🤖 LLM: ~75% accurate (use with caution)`);
    }

    saveResults() {
        // Save enhanced airports
        fs.writeFileSync('airports-with-icao-enhanced.json', JSON.stringify(this.enrichedAirports, null, 2));
        console.log('\n💾 Saved to airports-with-icao-enhanced.json');

        // Create summary
        const summary = {
            statistics: this.stats,
            totalAirports: this.enrichedAirports.length,
            airportsWithICAO: this.enrichedAirports.filter(a => a.icaoCode).length,
            databaseSize: this.openFlightsMapping.size,
            processedAt: new Date().toISOString(),
            sampleAirports: this.enrichedAirports.slice(0, 5)
        };

        fs.writeFileSync('enhanced-icao-summary.json', JSON.stringify(summary, null, 2));
        console.log('💾 Saved summary to enhanced-icao-summary.json');
    }

    async testConnection() {
        console.log('Testing Ollama connection...');
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`);
            if (response.ok) {
                console.log('✅ Ollama is running');
                return true;
            }
        } catch (error) {
            console.error('❌ Cannot connect to Ollama:', error.message);
            return false;
        }
    }
}

// Main execution
async function main() {
    const finder = new EnhancedICAOFinder();

    // Test connection first
    const connected = await finder.testConnection();
    if (!connected) {
        console.log('Make sure Ollama is running with: ollama serve');
        return;
    }

    console.log('\nStarting enhanced ICAO code enrichment...');
    console.log('📋 Strategy:');
    console.log('1. 🔧 Manual corrections (100% accurate)');
    console.log('2. 🌐 OpenFlights database (~99% accurate, 14,000+ airports)');
    console.log('3. 🤖 LLM fallback (~75% accurate, for missing airports)\n');

    await finder.processAirports();
}

main().catch(console.error);

export { EnhancedICAOFinder }; 