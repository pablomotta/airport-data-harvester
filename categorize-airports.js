import fs from 'fs';

class AirportCategorizer {
    constructor(ollamaUrl = 'http://localhost:11434', model = 'mistral:latest') {
        this.ollamaUrl = ollamaUrl;
        this.model = model;
        this.categorizedAirports = [];
        this.processedCount = 0;
        this.delayMs = 1000; // 1 second delay between requests

        // Size criteria
        this.criteria = {
            small: { maxLength: 800, description: 'Light GA aircraft, private strips' },
            medium: { minLength: 800, maxLength: 1800, description: 'Regional/turboprop, small jet operations' },
            large: { minLength: 1800, description: 'Commercial jets, wide‑body, international' }
        };
    }

    async queryLLM(prompt) {
        try {
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
                        temperature: 0.1, // Low temperature for factual responses
                        top_p: 0.9
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error(`Error querying LLM: ${error.message}`);
            return null;
        }
    }

    createRunwayPrompt(airport) {
        return `What is the longest runway length at ${airport.airportName} (${airport.airportCode}) in ${airport.city}, ${airport.country}?

Respond with ONLY the runway length in meters in this exact JSON format:
{
  "runwayLengthMeters": 1234,
  "confidence": "high"
}

If you're not certain about the exact length, use "confidence": "low". If no data available, use "runwayLengthMeters": null.
Only respond with valid JSON, nothing else.`;
    }

    parseRunwayResponse(response) {
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

            if (parsed.runwayLengthMeters !== null && !isNaN(parsed.runwayLengthMeters)) {
                const length = parseInt(parsed.runwayLengthMeters);

                // Validate reasonable runway length (100m - 6000m)
                if (length < 100 || length > 6000) {
                    console.log(`    ⚠️  Suspicious runway length: ${length}m (out of range 100-6000m)`);
                    return {
                        lengthMeters: length,
                        confidence: 'low' // Mark as low confidence due to unrealistic length
                    };
                }

                return {
                    lengthMeters: length,
                    confidence: parsed.confidence || 'unknown'
                };
            }

            return null;
        } catch (error) {
            console.error(`Error parsing runway response: ${error.message}`);
            return null;
        }
    }

    categorizeByLength(lengthMeters) {
        if (lengthMeters < this.criteria.small.maxLength) {
            return {
                size: 'Small',
                category: 'small',
                lengthRange: `< ${this.criteria.small.maxLength}m`,
                typicalUse: this.criteria.small.description
            };
        } else if (lengthMeters < this.criteria.large.minLength) {
            return {
                size: 'Medium',
                category: 'medium',
                lengthRange: `${this.criteria.medium.minLength} – ${this.criteria.medium.maxLength}m`,
                typicalUse: this.criteria.medium.description
            };
        } else {
            return {
                size: 'Large',
                category: 'large',
                lengthRange: `≥ ${this.criteria.large.minLength}m`,
                typicalUse: this.criteria.large.description
            };
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async categorizeAirport(airport) {
        // Validate airport data
        if (!airport.airportCode || !airport.airportName || !airport.city || !airport.country) {
            console.log(`  ⚠️  Skipping invalid airport data: ${JSON.stringify(airport)}`);
            return { ...airport, size: 'Unknown', runwayLengthMeters: null, confidence: 'none' };
        }

        const prompt = this.createRunwayPrompt(airport);
        console.log(`Checking: ${airport.airportCode} - ${airport.airportName}`);

        const response = await this.queryLLM(prompt);
        if (!response) {
            console.log(`  ❌ No response for ${airport.airportCode}`);
            return { ...airport, size: 'Unknown', runwayLengthMeters: null, confidence: 'none' };
        }

        const runwayData = this.parseRunwayResponse(response);
        if (!runwayData) {
            console.log(`  ⚪ No runway data for ${airport.airportCode}`);
            return { ...airport, size: 'Unknown', runwayLengthMeters: null, confidence: 'none' };
        }

        const sizeInfo = this.categorizeByLength(runwayData.lengthMeters);
        const categorizedAirport = {
            ...airport,
            runwayLengthMeters: runwayData.lengthMeters,
            runwayLengthFeet: Math.round(runwayData.lengthMeters * 3.28084),
            size: sizeInfo.size,
            category: sizeInfo.category,
            lengthRange: sizeInfo.lengthRange,
            typicalUse: sizeInfo.typicalUse,
            confidence: runwayData.confidence
        };

        console.log(`  ✅ ${airport.airportCode}: ${runwayData.lengthMeters}m → ${sizeInfo.size}`);
        return categorizedAirport;
    }

    async processAirports() {
        try {
            console.log('Reading airports data...');

            if (!fs.existsSync('airports-flat.json')) {
                console.error('❌ airports-flat.json not found');
                console.log('Please run reshape-airports.js first');
                return null;
            }

            const airports = JSON.parse(fs.readFileSync('airports-flat.json', 'utf8'));
            console.log(`Found ${airports.length} airports to categorize`);
            console.log(`Using model: ${this.model}\n`);

            for (let i = 0; i < airports.length; i++) {
                const airport = airports[i];
                console.log(`[${i + 1}/${airports.length}]`);

                const categorizedAirport = await this.categorizeAirport(airport);
                this.categorizedAirports.push(categorizedAirport);
                this.processedCount++;

                // Add delay to avoid overwhelming the LLM
                await this.delay(this.delayMs);
            }

            console.log('\n=== CATEGORIZATION COMPLETE ===');
            this.generateReport();
            this.saveResults();

            return this.categorizedAirports;

        } catch (error) {
            console.error('Error processing airports:', error);
            return null;
        }
    }

    generateReport() {
        const stats = {
            total: this.categorizedAirports.length,
            small: this.categorizedAirports.filter(a => a.category === 'small').length,
            medium: this.categorizedAirports.filter(a => a.category === 'medium').length,
            large: this.categorizedAirports.filter(a => a.category === 'large').length,
            unknown: this.categorizedAirports.filter(a => a.size === 'Unknown').length
        };

        console.log(`\nAIRPORT SIZE DISTRIBUTION:`);
        console.log(`📊 Total airports: ${stats.total}`);
        console.log(`🛩️  Small airports: ${stats.small} (${(stats.small / stats.total * 100).toFixed(1)}%)`);
        console.log(`✈️  Medium airports: ${stats.medium} (${(stats.medium / stats.total * 100).toFixed(1)}%)`);
        console.log(`🛫 Large airports: ${stats.large} (${(stats.large / stats.total * 100).toFixed(1)}%)`);
        console.log(`❓ Unknown: ${stats.unknown} (${(stats.unknown / stats.total * 100).toFixed(1)}%)`);

        // Show examples of each category
        console.log(`\nEXAMPLES BY CATEGORY:`);

        const smallExample = this.categorizedAirports.find(a => a.category === 'small');
        if (smallExample) {
            console.log(`🛩️  Small: ${smallExample.airportCode} - ${smallExample.runwayLengthMeters}m`);
        }

        const mediumExample = this.categorizedAirports.find(a => a.category === 'medium');
        if (mediumExample) {
            console.log(`✈️  Medium: ${mediumExample.airportCode} - ${mediumExample.runwayLengthMeters}m`);
        }

        const largeExample = this.categorizedAirports.find(a => a.category === 'large');
        if (largeExample) {
            console.log(`🛫 Large: ${largeExample.airportCode} - ${largeExample.runwayLengthMeters}m`);
        }
    }

    saveResults() {
        // Save categorized airports
        fs.writeFileSync('airports-categorized.json', JSON.stringify(this.categorizedAirports, null, 2));
        console.log('\n✅ Saved to airports-categorized.json');

        // Create summary by category
        const byCategory = {
            small: this.categorizedAirports.filter(a => a.category === 'small'),
            medium: this.categorizedAirports.filter(a => a.category === 'medium'),
            large: this.categorizedAirports.filter(a => a.category === 'large'),
            unknown: this.categorizedAirports.filter(a => a.size === 'Unknown')
        };

        fs.writeFileSync('airports-by-category.json', JSON.stringify(byCategory, null, 2));
        console.log('✅ Saved to airports-by-category.json');
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
    const categorizer = new AirportCategorizer();

    // Test connection first
    const connected = await categorizer.testConnection();
    if (!connected) {
        console.log('Make sure Ollama is running with: ollama serve');
        return;
    }

    console.log('\nStarting airport categorization...');
    console.log('Criteria:');
    console.log('🛩️  Small: < 800m - Light GA aircraft, private strips');
    console.log('✈️  Medium: 800-1,800m - Regional/turboprop, small jet operations');
    console.log('🛫 Large: ≥ 1,800m - Commercial jets, wide‑body, international\n');

    await categorizer.processAirports();
}

main().catch(console.error);

export { AirportCategorizer }; 