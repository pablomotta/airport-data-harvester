import fs from 'fs';

class ICAOCodeFinder {
    constructor(ollamaUrl = 'http://localhost:11434', model = 'mistral:latest') {
        this.ollamaUrl = ollamaUrl;
        this.model = model;
        this.enrichedAirports = [];
        this.processedCount = 0;
        this.delayMs = 500; // 0.5 second delay between requests
        this.stats = {
            apiFound: 0,
            llmFound: 0,
            notFound: 0,
            total: 0
        };
    }

    // Try to find ICAO code using OpenSky Network API (free, no key needed)
    async findICAOFromAPI(airport) {
        try {
            // Try searching by IATA code first
            const iataCode = airport.airportCode;

            // OpenSky Network has airport data but limited search
            // Let's try a different approach - use a free airport database API

            // Alternative: AeroDataBox API (free tier available)
            // For now, let's implement a simple approach that searches by name/location

            return null; // Will implement API calls if user wants specific service
        } catch (error) {
            return null;
        }
    }

    // Fallback: Use LLM to find ICAO code
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
            // Clean up the response to extract JSON
            let cleanResponse = response.trim();

            // Find JSON block
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

    // Manual mapping for common airports (most reliable)
    getKnownICAOCode(airport) {
        const iataCode = airport.airportCode?.toUpperCase();

        // Common IATA to ICAO mappings
        const knownMappings = {
            // Major international airports
            'LAX': 'KLAX', 'JFK': 'KJFK', 'LHR': 'EGLL', 'CDG': 'LFPG',
            'NRT': 'RJAA', 'HND': 'RJTT', 'DXB': 'OMDB', 'SIN': 'WSSS',
            'HKG': 'VHHH', 'ICN': 'RKSI', 'TPE': 'RCTP', 'KUL': 'WMKK',
            'BKK': 'VTBS', 'CGK': 'WIII', 'DEL': 'VIDP', 'BOM': 'VABB',
            'SYD': 'YSSY', 'MEL': 'YMML', 'PER': 'YPPH', 'YYZ': 'CYYZ',
            'YVR': 'CYVR', 'GRU': 'SBGR', 'EZE': 'SAEZ', 'GIG': 'SBGL',
            'LIM': 'SPJC', 'BOG': 'SKBO', 'PTY': 'MPTO', 'CUN': 'MMUN',
            'AMS': 'EHAM', 'FRA': 'EDDF', 'MUC': 'EDDM', 'ZUR': 'LSZH',
            'VIE': 'LOWW', 'ARN': 'ESSA', 'CPH': 'EKCH', 'OSL': 'ENGM',
            'HEL': 'EFHK', 'LED': 'ULLI', 'SVO': 'UUEE', 'DME': 'UUDD',
            'IST': 'LTFM', 'SAW': 'LTFJ', 'CAI': 'HECA', 'JNB': 'FAOR',
            'CPT': 'FACT', 'DUR': 'FALE', 'ADD': 'HAAB', 'NBO': 'HKJK',
            'LAD': 'FNLU', 'CAS': 'GMMN', 'TUN': 'DTTA', 'ALG': 'DAAG',
            // Asia-Pacific
            'PEK': 'ZBAA', 'PVG': 'ZSPD', 'CAN': 'ZGGG', 'CTU': 'ZUUU',
            'KMG': 'ZPPP', 'XIY': 'ZLXY', 'URC': 'ZWWW', 'TSN': 'ZBTJ',
            'CGO': 'ZHCC', 'WUH': 'ZHHH', 'CKG': 'ZUCK', 'KWE': 'ZUGY',
            'SZX': 'ZGSZ', 'XMN': 'ZSAM', 'FOC': 'ZSFZ', 'TAO': 'ZSQD',
            'NKG': 'ZSNJ', 'NNG': 'ZGNN', 'HAK': 'ZJHK', 'SYX': 'ZJSY',
            // Europe additions
            'MAD': 'LEMD', 'BCN': 'LEBL', 'LIS': 'LPPT', 'OPO': 'LPPR',
            'FCO': 'LIRF', 'MXP': 'LIMC', 'LIN': 'LIML', 'VCE': 'LIPZ',
            'ATH': 'LGAV', 'SKG': 'LGTS', 'BUD': 'LHBP', 'PRG': 'LKPR',
            'WAW': 'EPWA', 'KRK': 'EPKK', 'BRU': 'EBBR', 'LUX': 'ELLX'
        };

        return knownMappings[iataCode] || null;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async enrichAirportWithICAO(airport) {
        console.log(`[${this.processedCount + 1}] Processing: ${airport.airportCode} - ${airport.airportName}`);

        // Step 1: Check known mappings first (fastest and most reliable)
        let icaoCode = this.getKnownICAOCode(airport);
        if (icaoCode) {
            console.log(`  ✅ Known mapping: ${airport.airportCode} → ${icaoCode}`);
            this.stats.apiFound++; // Count as "API" since it's reliable
            return { ...airport, icaoCode, icaoSource: 'known_mapping' };
        }

        // Step 2: Try API (if implemented)
        icaoCode = await this.findICAOFromAPI(airport);
        if (icaoCode) {
            console.log(`  ✅ API found: ${airport.airportCode} → ${icaoCode}`);
            this.stats.apiFound++;
            return { ...airport, icaoCode, icaoSource: 'api' };
        }

        // Step 3: Fallback to LLM
        icaoCode = await this.findICAOFromLLM(airport);
        if (icaoCode) {
            console.log(`  🤖 LLM found: ${airport.airportCode} → ${icaoCode}`);
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
            console.log('Reading airports data...');

            if (!fs.existsSync('airports-categorized.json')) {
                console.error('❌ airports-categorized.json not found');
                console.log('Please run categorize-airports.js first');
                return null;
            }

            const airports = JSON.parse(fs.readFileSync('airports-categorized.json', 'utf8'));
            console.log(`Found ${airports.length} airports to enrich with ICAO codes`);
            console.log(`Using model: ${this.model}\n`);

            this.stats.total = airports.length;

            for (let i = 0; i < airports.length; i++) {
                const airport = airports[i];

                const enrichedAirport = await this.enrichAirportWithICAO(airport);
                this.enrichedAirports.push(enrichedAirport);
                this.processedCount++;

                // Add delay to avoid overwhelming APIs/LLM
                await this.delay(this.delayMs);
            }

            console.log('\n=== ICAO CODE ENRICHMENT COMPLETE ===');
            this.generateReport();
            this.saveResults();

            return this.enrichedAirports;

        } catch (error) {
            console.error('Error processing airports:', error);
            return null;
        }
    }

    generateReport() {
        console.log(`\nICAO CODE STATISTICS:`);
        console.log(`📊 Total airports: ${this.stats.total}`);
        console.log(`✅ Known/API found: ${this.stats.apiFound} (${(this.stats.apiFound / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🤖 LLM found: ${this.stats.llmFound} (${(this.stats.llmFound / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`❌ Not found: ${this.stats.notFound} (${(this.stats.notFound / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`📈 Success rate: ${((this.stats.apiFound + this.stats.llmFound) / this.stats.total * 100).toFixed(1)}%`);

        // Show examples by source
        const bySource = {
            known_mapping: this.enrichedAirports.filter(a => a.icaoSource === 'known_mapping'),
            api: this.enrichedAirports.filter(a => a.icaoSource === 'api'),
            llm: this.enrichedAirports.filter(a => a.icaoSource === 'llm'),
            not_found: this.enrichedAirports.filter(a => a.icaoSource === 'not_found')
        };

        console.log(`\nEXAMPLES BY SOURCE:`);
        if (bySource.known_mapping.length > 0) {
            const example = bySource.known_mapping[0];
            console.log(`✅ Known: ${example.airportCode} → ${example.icaoCode}`);
        }
        if (bySource.llm.length > 0) {
            const example = bySource.llm[0];
            console.log(`🤖 LLM: ${example.airportCode} → ${example.icaoCode}`);
        }
    }

    saveResults() {
        // Save enriched airports
        fs.writeFileSync('airports-with-icao.json', JSON.stringify(this.enrichedAirports, null, 2));
        console.log('\n✅ Saved to airports-with-icao.json');

        // Create summary by ICAO source
        const summary = {
            statistics: this.stats,
            totalAirports: this.enrichedAirports.length,
            airportsWithICAO: this.enrichedAirports.filter(a => a.icaoCode).length,
            processedAt: new Date().toISOString(),
            sampleAirports: this.enrichedAirports.slice(0, 5)
        };

        fs.writeFileSync('icao-enrichment-summary.json', JSON.stringify(summary, null, 2));
        console.log('✅ Saved summary to icao-enrichment-summary.json');
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
    const finder = new ICAOCodeFinder();

    // Test connection first
    const connected = await finder.testConnection();
    if (!connected) {
        console.log('Make sure Ollama is running with: ollama serve');
        return;
    }

    console.log('\nStarting ICAO code enrichment...');
    console.log('Strategy:');
    console.log('1. ✅ Check known IATA→ICAO mappings (fastest)');
    console.log('2. 🤖 Query LLM for unknown codes (fallback)');
    console.log('3. ❌ Mark as not found if no reliable source\n');

    await finder.processAirports();
}

main().catch(console.error);

export { ICAOCodeFinder }; 