import fs from 'fs';

function reshapeAirportsData() {
    try {
        console.log('Reading airports data...');

        // Try to read from airports-found.json first (which should already be flat)
        let data;
        if (fs.existsSync('airports-found.json')) {
            data = JSON.parse(fs.readFileSync('airports-found.json', 'utf8'));
            console.log(`Found ${data.length} airports in airports-found.json`);

            // Check if it's already in the correct format
            if (Array.isArray(data) && data.length > 0 && data[0].country) {
                console.log('✅ Data is already in flat format!');
                fs.writeFileSync('airports-flat.json', JSON.stringify(data, null, 2));
                console.log('Saved flat data to airports-flat.json');
                return data;
            }
        }

        // If not found or not in correct format, try airports-summary.json
        if (fs.existsSync('airports-summary.json')) {
            const summaryData = JSON.parse(fs.readFileSync('airports-summary.json', 'utf8'));

            if (summaryData.airportsByCountry) {
                console.log('Reshaping data from airports-summary.json...');
                data = [];

                for (const [country, airports] of Object.entries(summaryData.airportsByCountry)) {
                    for (const airport of airports) {
                        data.push({
                            city: airport.city,
                            airportCode: airport.airportCode,
                            airportName: airport.airportName,
                            country: country
                        });
                    }
                }

                console.log(`✅ Reshaped ${data.length} airports from ${Object.keys(summaryData.airportsByCountry).length} countries`);
            }
        }

        if (!data || data.length === 0) {
            console.error('❌ No airports data found. Please run find-airports.js first.');
            return [];
        }

        // Sort by country, then by city
        data.sort((a, b) => {
            if (a.country !== b.country) {
                return a.country.localeCompare(b.country);
            }
            return a.city.localeCompare(b.city);
        });

        // Save the flat structure
        fs.writeFileSync('airports-flat.json', JSON.stringify(data, null, 2));
        console.log('✅ Saved flat airports data to airports-flat.json');

        // Create a summary
        const countriesCount = new Set(data.map(airport => airport.country)).size;
        const summary = {
            totalAirports: data.length,
            totalCountries: countriesCount,
            sampleAirports: data.slice(0, 5), // First 5 as examples
            reshapedAt: new Date().toISOString()
        };

        fs.writeFileSync('airports-flat-summary.json', JSON.stringify(summary, null, 2));
        console.log(`✅ Created summary: ${data.length} airports across ${countriesCount} countries`);

        // Show some examples
        console.log('\nFirst 5 airports:');
        data.slice(0, 5).forEach(airport => {
            console.log(`  ${airport.airportCode} - ${airport.airportName} (${airport.city}, ${airport.country})`);
        });

        return data;

    } catch (error) {
        console.error('Error reshaping airports data:', error);
        return [];
    }
}

// Main execution
function main() {
    console.log('🔄 Reshaping airports data to flat structure...\n');

    const flatData = reshapeAirportsData();

    if (flatData.length > 0) {
        console.log('\n✅ Reshaping complete!');
        console.log('📄 Output file: airports-flat.json');
        console.log('📊 Summary file: airports-flat-summary.json');

        console.log('\nFlat structure format:');
        console.log(JSON.stringify(flatData[0], null, 2));
    } else {
        console.log('\n❌ No data to reshape. Make sure to run find-airports.js first.');
    }
}

main();

export { reshapeAirportsData }; 