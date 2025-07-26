import fs from 'fs';

class OpenFlightsProcessor {
    constructor() {
        this.cleanedAirports = [];
        this.stats = {
            total: 0,
            withBothCodes: 0,
            iataOnly: 0,
            icaoOnly: 0,
            neitherCode: 0
        };
    }

    async downloadOpenFlightsData() {
        console.log('📥 Downloading OpenFlights airport database...');

        try {
            const response = await fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat');
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

    processOpenFlightsData(csvData) {
        console.log('🔄 Processing OpenFlights data...');

        const lines = csvData.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const fields = this.parseCSVLine(line);

                if (fields.length >= 13) {
                    const airport = {
                        id: parseInt(fields[0]) || null,
                        name: fields[1] || null,
                        city: fields[2] || null,
                        country: fields[3] || null,
                        iataCode: fields[4] === '\\N' ? null : fields[4],
                        icaoCode: fields[5] === '\\N' ? null : fields[5],
                        latitude: parseFloat(fields[6]) || null,
                        longitude: parseFloat(fields[7]) || null,
                        altitude: parseInt(fields[8]) || null,
                        timezone: parseFloat(fields[9]) || null,
                        dst: fields[10] || null,
                        timezoneDatabase: fields[11] === '\\N' ? null : fields[11],
                        type: fields[12] || null,
                        source: fields[13] || null
                    };

                    // Clean up empty strings
                    Object.keys(airport).forEach(key => {
                        if (airport[key] === '' || airport[key] === '\\N') {
                            airport[key] = null;
                        }
                    });

                    // Update statistics
                    this.stats.total++;

                    if (airport.iataCode && airport.icaoCode) {
                        this.stats.withBothCodes++;
                    } else if (airport.iataCode && !airport.icaoCode) {
                        this.stats.iataOnly++;
                    } else if (!airport.iataCode && airport.icaoCode) {
                        this.stats.icaoOnly++;
                    } else {
                        this.stats.neitherCode++;
                    }

                    this.cleanedAirports.push(airport);
                }
            } catch (error) {
                console.error(`Error parsing line: ${line.substring(0, 50)}...`);
                continue;
            }
        }

        console.log(`✅ Processed ${this.stats.total} airports`);
        this.generateReport();
    }

    generateReport() {
        console.log(`\n📊 OPENFLIGHTS DATA STATISTICS:`);
        console.log(`Total airports: ${this.stats.total}`);
        console.log(`✅ With both IATA & ICAO: ${this.stats.withBothCodes} (${(this.stats.withBothCodes / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`📍 IATA only: ${this.stats.iataOnly} (${(this.stats.iataOnly / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🛩️  ICAO only: ${this.stats.icaoOnly} (${(this.stats.icaoOnly / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`❌ Neither code: ${this.stats.neitherCode} (${(this.stats.neitherCode / this.stats.total * 100).toFixed(1)}%)`);

        // Show sample data
        console.log(`\n🎯 SAMPLE AIRPORTS WITH BOTH CODES:`);
        const samplesWithBoth = this.cleanedAirports
            .filter(a => a.iataCode && a.icaoCode)
            .slice(0, 5);

        samplesWithBoth.forEach(airport => {
            console.log(`  ${airport.iataCode}/${airport.icaoCode} - ${airport.name} (${airport.city}, ${airport.country})`);
        });
    }

    createFilteredDatasets() {
        // Create different filtered versions
        const datasets = {
            // All airports
            all: this.cleanedAirports,

            // Only airports with both IATA and ICAO codes
            withBothCodes: this.cleanedAirports.filter(a => a.iataCode && a.icaoCode),

            // Only airports (not heliports, etc.)
            airportsOnly: this.cleanedAirports.filter(a =>
                a.type === 'airport' && a.iataCode && a.icaoCode
            ),

            // Large airports (typically commercial)
            largeAirports: this.cleanedAirports.filter(a =>
                a.type === 'airport' &&
                a.iataCode &&
                a.icaoCode &&
                a.name.toLowerCase().includes('international')
            ),

            // Simple lookup table (IATA -> ICAO)
            iataToIcao: this.cleanedAirports
                .filter(a => a.iataCode && a.icaoCode)
                .reduce((lookup, airport) => {
                    lookup[airport.iataCode] = airport.icaoCode;
                    return lookup;
                }, {})
        };

        return datasets;
    }

    saveResults() {
        const datasets = this.createFilteredDatasets();

        // Save all datasets
        fs.writeFileSync('openflights-all.json', JSON.stringify(datasets.all, null, 2));
        console.log('\n💾 Saved complete dataset to openflights-all.json');

        fs.writeFileSync('openflights-with-codes.json', JSON.stringify(datasets.withBothCodes, null, 2));
        console.log('💾 Saved airports with both codes to openflights-with-codes.json');

        fs.writeFileSync('openflights-airports-only.json', JSON.stringify(datasets.airportsOnly, null, 2));
        console.log('💾 Saved airports only to openflights-airports-only.json');

        fs.writeFileSync('iata-to-icao-lookup.json', JSON.stringify(datasets.iataToIcao, null, 2));
        console.log('💾 Saved IATA→ICAO lookup table to iata-to-icao-lookup.json');

        // Create summary
        const summary = {
            statistics: this.stats,
            totalAirports: datasets.all.length,
            airportsWithBothCodes: datasets.withBothCodes.length,
            airportsOnly: datasets.airportsOnly.length,
            lookupTableSize: Object.keys(datasets.iataToIcao).length,
            downloadedAt: new Date().toISOString(),
            sampleAirports: datasets.withBothCodes.slice(0, 10)
        };

        fs.writeFileSync('openflights-summary.json', JSON.stringify(summary, null, 2));
        console.log('💾 Saved summary to openflights-summary.json');
    }

    async process() {
        try {
            console.log('🚀 OpenFlights Data Processor\n');

            // Download data
            const csvData = await this.downloadOpenFlightsData();
            if (!csvData) {
                console.error('❌ Could not download data');
                return null;
            }

            // Process data
            this.processOpenFlightsData(csvData);

            // Save results
            this.saveResults();

            console.log('\n✅ Processing complete!');
            console.log('📁 Created multiple formats for different use cases');

            return this.cleanedAirports;

        } catch (error) {
            console.error('Error processing OpenFlights data:', error);
            return null;
        }
    }
}

// Main execution
async function main() {
    const processor = new OpenFlightsProcessor();
    await processor.process();
}

main().catch(console.error);

export { OpenFlightsProcessor }; 