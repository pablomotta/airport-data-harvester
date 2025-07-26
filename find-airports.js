import fs from 'fs';

class AirportFinder {
    constructor(ollamaUrl = 'http://localhost:11434', model = 'mistral:latest') {
        this.ollamaUrl = ollamaUrl;
        this.model = model;
        this.airports = [];
        this.processedCities = 0;
        this.delayMs = 1000; // 1 second delay between requests
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
                        temperature: 0.1, // Low temperature for consistent, factual responses
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

    createAirportPrompt(city, country) {
        return `Does the city "${city}" in "${country}" have a commercial airport? If yes, provide the airport information in this exact JSON format:

{
  "hasAirport": true,
  "airportCode": "XXX",
  "airportName": "Full Airport Name",
  "city": "${city}",
  "country": "${country}"
}

If no commercial airport exists, respond with:
{
  "hasAirport": false
}

Only respond with valid JSON. Be factual and accurate. If uncertain, respond with hasAirport: false.`;
    }

    parseAirportResponse(response) {
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

            if (parsed.hasAirport === true && parsed.airportCode && parsed.airportName) {
                return {
                    country: parsed.country,
                    city: parsed.city,
                    airportCode: parsed.airportCode.toUpperCase(),
                    airportName: parsed.airportName
                };
            }

            return null;
        } catch (error) {
            console.error(`Error parsing LLM response: ${error.message}`);
            console.error(`Response was: ${response.substring(0, 200)}...`);
            return null;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async findAirportsInCity(city, country) {
        const prompt = this.createAirportPrompt(city, country);
        console.log(`Checking: ${city}, ${country}`);

        const response = await this.queryLLM(prompt);
        if (!response) {
            console.log(`  ❌ No response for ${city}`);
            return null;
        }

        const airport = this.parseAirportResponse(response);
        if (airport) {
            console.log(`  ✅ Found airport: ${airport.airportCode} - ${airport.airportName}`);
            this.airports.push(airport);
            return airport;
        } else {
            console.log(`  ⚪ No airport in ${city}`);
            return null;
        }
    }

    async processCitiesData() {
        try {
            console.log('Reading cleaned cities data...');
            const data = JSON.parse(fs.readFileSync('beautiful-cities-cleaned.json', 'utf8'));

            console.log(`Found ${data.length} countries to process`);
            console.log(`Using model: ${this.model}`);
            console.log(`Ollama URL: ${this.ollamaUrl}`);
            console.log('Starting airport search...\n');

            for (const countryData of data) {
                const { country, cities } = countryData;

                console.log(`\n--- Processing ${country} (${cities.length} cities) ---`);

                for (const city of cities) {
                    await this.findAirportsInCity(city, country);
                    this.processedCities++;

                    // Add delay to avoid overwhelming the LLM
                    await this.delay(this.delayMs);
                }
            }

            console.log('\n=== PROCESSING COMPLETE ===');
            console.log(`Total cities processed: ${this.processedCities}`);
            console.log(`Total airports found: ${this.airports.length}`);

            // Save results
            fs.writeFileSync('airports-found.json', JSON.stringify(this.airports, null, 2));
            console.log('Results saved to airports-found.json');

            // Save summary
            const summary = {
                totalCitiesProcessed: this.processedCities,
                totalAirportsFound: this.airports.length,
                airportsByCountry: this.getAirportsByCountry(),
                processedAt: new Date().toISOString()
            };

            fs.writeFileSync('airports-summary.json', JSON.stringify(summary, null, 2));
            console.log('Summary saved to airports-summary.json');

            return this.airports;

        } catch (error) {
            console.error('Error processing cities:', error);
            return null;
        }
    }

    getAirportsByCountry() {
        const byCountry = {};
        for (const airport of this.airports) {
            if (!byCountry[airport.country]) {
                byCountry[airport.country] = [];
            }
            byCountry[airport.country].push({
                city: airport.city,
                airportCode: airport.airportCode,
                airportName: airport.airportName
            });
        }
        return byCountry;
    }

    async testConnection() {
        console.log('Testing Ollama connection...');
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Ollama is running');
                console.log('Available models:', data.models.map(m => m.name));
                return true;
            }
        } catch (error) {
            console.error('❌ Cannot connect to Ollama:', error.message);
            console.error('Make sure Ollama is running with: ollama serve');
            return false;
        }
    }
}

// Main execution
async function main() {
    const finder = new AirportFinder();

    // Test connection first
    const connected = await finder.testConnection();
    if (!connected) {
        console.log('\nTo set up Ollama:');
        console.log('1. Install: https://ollama.ai/');
        console.log('2. Run: ollama pull mistral:latest');
        console.log('3. Start: ollama serve');
        return;
    }

    // Check if cleaned data exists
    if (!fs.existsSync('beautiful-cities-cleaned.json')) {
        console.error('❌ beautiful-cities-cleaned.json not found');
        console.log('Please run clean-cities.js first to generate the cleaned data');
        return;
    }

    console.log('\nStarting airport discovery process...');
    await finder.processCitiesData();
}

main().catch(console.error);

export { AirportFinder }; 