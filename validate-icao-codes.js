import fs from 'fs';

function validateICAOCodes() {
    try {
        console.log('Validating ICAO codes...');

        if (!fs.existsSync('airports-with-icao.json')) {
            console.error('❌ airports-with-icao.json not found');
            return;
        }

        const airports = JSON.parse(fs.readFileSync('airports-with-icao.json', 'utf8'));

        // Known corrections (add more as you find them)
        const corrections = {
            'KVP': 'LUTR',  // Tiraspol - corrected per MSFS2024
            'KIV': 'LUKK'   // Chișinău - Moldova pattern
        };

        // Regional patterns for validation
        const regionPatterns = {
            'LU': ['Moldova'],
            'UL': ['Russia', 'Kazakhstan', 'Uzbekistan'],
            'EG': ['United Kingdom'],
            'LF': ['France'],
            'ED': ['Germany'],
            'LE': ['Spain'],
            'LI': ['Italy'],
            'WM': ['Malaysia'],
            'WS': ['Singapore'],
            'VT': ['Thailand'],
            'VI': ['India'],
            'ZB': ['China (Beijing area)'],
            'ZS': ['China (Shanghai area)'],
            'RJ': ['Japan'],
            'RK': ['South Korea'],
            'OM': ['UAE'],
            'OT': ['Qatar'],
            'K': ['United States (continental)'],
            'C': ['Canada'],
            'S': ['South America'],
            'F': ['Africa'],
            'Y': ['Australia'],
            'N': ['Pacific islands']
        };

        let corrections_made = 0;
        let suspicious_codes = [];

        console.log('\n🔍 Checking for corrections and suspicious codes...\n');

        for (let airport of airports) {
            const iataCode = airport.airportCode;
            const currentICAO = airport.icaoCode;
            const country = airport.country;

            // Apply known corrections
            if (corrections[iataCode] && currentICAO !== corrections[iataCode]) {
                console.log(`🔧 CORRECTED: ${iataCode} ${currentICAO} → ${corrections[iataCode]} (${airport.airportName})`);
                airport.icaoCode = corrections[iataCode];
                airport.icaoSource = 'manual_correction';
                corrections_made++;
            }

            // Check for suspicious patterns
            if (currentICAO && airport.icaoSource === 'llm') {
                const prefix = currentICAO.substring(0, 2);
                const pattern = regionPatterns[prefix];

                if (pattern) {
                    // Check if country matches expected pattern
                    const countryMatch = pattern.some(region =>
                        country.toLowerCase().includes(region.toLowerCase()) ||
                        region.toLowerCase().includes(country.toLowerCase())
                    );

                    if (!countryMatch) {
                        suspicious_codes.push({
                            airport: `${iataCode} (${airport.airportName})`,
                            country: country,
                            icao: currentICAO,
                            expectedRegion: pattern.join(', '),
                            confidence: airport.confidence
                        });
                    }
                }
            }
        }

        // Save corrected data
        if (corrections_made > 0) {
            fs.writeFileSync('airports-with-icao-corrected.json', JSON.stringify(airports, null, 2));
            console.log(`\n✅ Applied ${corrections_made} corrections`);
            console.log('💾 Saved corrected data to airports-with-icao-corrected.json');
        }

        // Report suspicious codes
        if (suspicious_codes.length > 0) {
            console.log(`\n⚠️ Found ${suspicious_codes.length} suspicious ICAO codes:\n`);

            suspicious_codes.slice(0, 10).forEach(item => {
                console.log(`❓ ${item.airport} in ${item.country}`);
                console.log(`   ICAO: ${item.icao} (expected region: ${item.expectedRegion})`);
                console.log(`   Confidence: ${item.confidence}\n`);
            });

            if (suspicious_codes.length > 10) {
                console.log(`... and ${suspicious_codes.length - 10} more\n`);
            }

            // Save suspicious codes for manual review
            fs.writeFileSync('suspicious-icao-codes.json', JSON.stringify(suspicious_codes, null, 2));
            console.log('💾 Saved suspicious codes to suspicious-icao-codes.json for manual review');
        }

        // Generate statistics
        const stats = {
            total: airports.length,
            withICAO: airports.filter(a => a.icaoCode).length,
            bySource: {
                known_mapping: airports.filter(a => a.icaoSource === 'known_mapping').length,
                manual_correction: airports.filter(a => a.icaoSource === 'manual_correction').length,
                llm: airports.filter(a => a.icaoSource === 'llm').length,
                not_found: airports.filter(a => a.icaoSource === 'not_found').length
            },
            corrections_made,
            suspicious_count: suspicious_codes.length
        };

        console.log('\n📊 VALIDATION SUMMARY:');
        console.log(`Total airports: ${stats.total}`);
        console.log(`With ICAO codes: ${stats.withICAO} (${(stats.withICAO / stats.total * 100).toFixed(1)}%)`);
        console.log(`Known/corrected: ${stats.bySource.known_mapping + stats.bySource.manual_correction}`);
        console.log(`LLM generated: ${stats.bySource.llm}`);
        console.log(`Corrections made: ${stats.corrections_made}`);
        console.log(`Suspicious codes: ${stats.suspicious_count}`);

        return {
            corrected_airports: airports,
            suspicious_codes,
            stats
        };

    } catch (error) {
        console.error('Error validating ICAO codes:', error);
        return null;
    }
}

// Main execution
function main() {
    console.log('🔍 ICAO Code Validation Tool\n');

    const result = validateICAOCodes();

    if (result) {
        console.log('\n✅ Validation complete!');
        if (result.stats.corrections_made > 0) {
            console.log('📄 Use airports-with-icao-corrected.json for the corrected data');
        }
        if (result.stats.suspicious_count > 0) {
            console.log('📄 Review suspicious-icao-codes.json for potential issues');
        }
    }
}

main();

export { validateICAOCodes }; 