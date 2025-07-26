import fs from 'fs';

class AirportCorrector {
    constructor() {
        this.correctedAirports = [];
        this.openFlightsData = [];
        this.openFlightsByName = new Map();
        this.openFlightsByIATA = new Map();
        this.stats = {
            total: 0,
            exactNameMatch: 0,
            partialNameMatch: 0,
            iataMatch: 0,
            corrected: 0,
            noMatch: 0
        };
    }

    loadData() {
        try {
            // Load your existing airport data
            if (!fs.existsSync('airports-with-icao.json')) {
                console.error('❌ airports-with-icao.json not found');
                return false;
            }

            // Load clean OpenFlights data
            if (!fs.existsSync('openflights-airports-only.json')) {
                console.error('❌ openflights-airports-only.json not found');
                console.log('Please run download-openflights.js first');
                return false;
            }

            const yourAirports = JSON.parse(fs.readFileSync('airports-with-icao.json', 'utf8'));
            this.openFlightsData = JSON.parse(fs.readFileSync('openflights-airports-only.json', 'utf8'));

            console.log(`📋 Loaded ${yourAirports.length} airports from your data`);
            console.log(`📋 Loaded ${this.openFlightsData.length} airports from OpenFlights`);

            // Create lookup maps for OpenFlights data
            this.createLookupMaps();

            this.stats.total = yourAirports.length;
            return yourAirports;

        } catch (error) {
            console.error('Error loading data:', error);
            return false;
        }
    }

    createLookupMaps() {
        console.log('🔄 Creating OpenFlights lookup maps...');

        for (const airport of this.openFlightsData) {
            // Map by name (normalize for better matching)
            if (airport.name) {
                const normalizedName = this.normalizeName(airport.name);
                if (!this.openFlightsByName.has(normalizedName)) {
                    this.openFlightsByName.set(normalizedName, []);
                }
                this.openFlightsByName.get(normalizedName).push(airport);
            }

            // Map by IATA code
            if (airport.iataCode) {
                this.openFlightsByIATA.set(airport.iataCode.toUpperCase(), airport);
            }
        }

        console.log(`✅ Created name lookup for ${this.openFlightsByName.size} unique names`);
        console.log(`✅ Created IATA lookup for ${this.openFlightsByIATA.size} IATA codes`);
    }

    normalizeName(name) {
        return name
            .toLowerCase()
            .replace(/international|airport|air base|airfield|aerodrome/gi, '')
            .replace(/[^\w\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
    }

    findOpenFlightsMatch(yourAirport) {
        // Strategy 1: Exact name match
        const normalizedYourName = this.normalizeName(yourAirport.airportName || '');
        const exactMatches = this.openFlightsByName.get(normalizedYourName);

        if (exactMatches && exactMatches.length > 0) {
            // If multiple matches, prefer one from same country
            const countryMatch = exactMatches.find(match =>
                this.normalizeCountry(match.country) === this.normalizeCountry(yourAirport.country)
            );

            if (countryMatch) {
                return { match: countryMatch, type: 'exactNameCountry' };
            }

            return { match: exactMatches[0], type: 'exactName' };
        }

        // Strategy 2: Partial name match (fuzzy)
        const partialMatch = this.findPartialNameMatch(normalizedYourName, yourAirport.country);
        if (partialMatch) {
            return { match: partialMatch, type: 'partialName' };
        }

        // Strategy 3: IATA code match (as fallback, since IATA might be wrong)
        if (yourAirport.airportCode) {
            const iataMatch = this.openFlightsByIATA.get(yourAirport.airportCode.toUpperCase());
            if (iataMatch) {
                return { match: iataMatch, type: 'iata' };
            }
        }

        return null;
    }

    findPartialNameMatch(normalizedName, country) {
        if (normalizedName.length < 4) return null; // Too short to fuzzy match

        const words = normalizedName.split(' ').filter(word => word.length > 2);
        if (words.length === 0) return null;

        for (const [openFlightsName, airports] of this.openFlightsByName.entries()) {
            // Check if significant words overlap
            const openFlightsWords = openFlightsName.split(' ').filter(word => word.length > 2);
            const commonWords = words.filter(word =>
                openFlightsWords.some(ofWord => ofWord.includes(word) || word.includes(ofWord))
            );

            // If at least half the words match, consider it a partial match
            if (commonWords.length >= Math.min(2, Math.ceil(words.length / 2))) {
                // Prefer matches from same country
                const countryMatch = airports.find(airport =>
                    this.normalizeCountry(airport.country) === this.normalizeCountry(country)
                );

                if (countryMatch) {
                    return countryMatch;
                }
            }
        }

        return null;
    }

    normalizeCountry(country) {
        return (country || '')
            .toLowerCase()
            .replace(/republic of|kingdom of|people's democratic republic of|democratic republic of/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    needsCorrection(yourAirport, openFlightsMatch) {
        const corrections = [];

        // Check IATA code
        if (yourAirport.airportCode !== openFlightsMatch.iataCode) {
            corrections.push(`IATA: ${yourAirport.airportCode} → ${openFlightsMatch.iataCode}`);
        }

        // Check ICAO code
        if (yourAirport.icaoCode !== openFlightsMatch.icaoCode) {
            corrections.push(`ICAO: ${yourAirport.icaoCode} → ${openFlightsMatch.icaoCode}`);
        }

        // Check city
        if (yourAirport.city !== openFlightsMatch.city) {
            corrections.push(`City: ${yourAirport.city} → ${openFlightsMatch.city}`);
        }

        // Check airport name (allow some flexibility)
        const yourNormalized = this.normalizeName(yourAirport.airportName);
        const openFlightsNormalized = this.normalizeName(openFlightsMatch.name);
        if (yourNormalized !== openFlightsNormalized) {
            corrections.push(`Name: ${yourAirport.airportName} → ${openFlightsMatch.name}`);
        }

        return corrections;
    }

    correctAirport(yourAirport, openFlightsMatch, matchType) {
        const corrections = this.needsCorrection(yourAirport, openFlightsMatch);

        if (corrections.length === 0) {
            return { ...yourAirport, correctionStatus: 'no_correction_needed', matchType };
        }

        const correctedAirport = {
            ...yourAirport,
            // Update with OpenFlights data
            airportCode: openFlightsMatch.iataCode,
            icaoCode: openFlightsMatch.icaoCode,
            airportName: openFlightsMatch.name,
            city: openFlightsMatch.city,
            country: openFlightsMatch.country,
            // Add metadata
            correctionStatus: 'corrected',
            matchType,
            corrections,
            originalData: {
                airportCode: yourAirport.airportCode,
                icaoCode: yourAirport.icaoCode,
                airportName: yourAirport.airportName,
                city: yourAirport.city,
                country: yourAirport.country
            },
            openFlightsData: {
                id: openFlightsMatch.id,
                latitude: openFlightsMatch.latitude,
                longitude: openFlightsMatch.longitude,
                altitude: openFlightsMatch.altitude
            }
        };

        this.stats.corrected++;
        return correctedAirport;
    }

    processAirports(yourAirports) {
        console.log('\n🔄 Processing airports for corrections...\n');

        for (let i = 0; i < yourAirports.length; i++) {
            const yourAirport = yourAirports[i];

            console.log(`[${i + 1}/${yourAirports.length}] Processing: ${yourAirport.airportCode} - ${yourAirport.airportName}`);
            console.log(`  📍 ${yourAirport.city}, ${yourAirport.country}`);

            const matchResult = this.findOpenFlightsMatch(yourAirport);

            if (matchResult) {
                const { match, type } = matchResult;
                console.log(`  ✅ Found match (${type}): ${match.iataCode}/${match.icaoCode} - ${match.name}`);
                console.log(`     📍 ${match.city}, ${match.country}`);

                const correctedAirport = this.correctAirport(yourAirport, match, type);

                if (correctedAirport.correctionStatus === 'corrected') {
                    console.log(`  🔧 Corrections needed:`);
                    correctedAirport.corrections.forEach(correction => {
                        console.log(`     ${correction}`);
                    });
                } else {
                    console.log(`  ✅ No corrections needed`);
                }

                this.correctedAirports.push(correctedAirport);

                // Update statistics
                switch (type) {
                    case 'exactName':
                    case 'exactNameCountry':
                        this.stats.exactNameMatch++;
                        break;
                    case 'partialName':
                        this.stats.partialNameMatch++;
                        break;
                    case 'iata':
                        this.stats.iataMatch++;
                        break;
                }
            } else {
                console.log(`  ❌ No OpenFlights match found - marking as unverified`);
                this.correctedAirports.push({
                    ...yourAirport,
                    unverified: true,
                    correctionStatus: 'no_match',
                    matchType: 'none'
                });
                this.stats.noMatch++;
            }

            console.log(''); // Empty line for readability
        }
    }

    generateReport() {
        console.log('\n=== CORRECTION REPORT ===');
        console.log(`📊 Total airports processed: ${this.stats.total}`);
        console.log(`✅ Exact name matches: ${this.stats.exactNameMatch} (${(this.stats.exactNameMatch / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🔍 Partial name matches: ${this.stats.partialNameMatch} (${(this.stats.partialNameMatch / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🏷️  IATA code matches: ${this.stats.iataMatch} (${(this.stats.iataMatch / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`🔧 Total corrections made: ${this.stats.corrected} (${(this.stats.corrected / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`❌ Unverified (no match): ${this.stats.noMatch} (${(this.stats.noMatch / this.stats.total * 100).toFixed(1)}%)`);

        // Show examples of corrections
        const correctedExamples = this.correctedAirports
            .filter(a => a.correctionStatus === 'corrected')
            .slice(0, 5);

        if (correctedExamples.length > 0) {
            console.log('\n🎯 EXAMPLE CORRECTIONS:');
            correctedExamples.forEach(airport => {
                console.log(`\n${airport.originalData.airportCode} → ${airport.airportCode} (${airport.airportName})`);
                airport.corrections.forEach(correction => {
                    console.log(`  ${correction}`);
                });
            });
        }
    }

    saveResults() {
        // Save corrected airports (all in one file)
        fs.writeFileSync('airports-with-icao-corrected.json', JSON.stringify(this.correctedAirports, null, 2));
        console.log('\n💾 Saved corrected data to airports-with-icao-corrected.json');

        // Save only the corrections for review
        const correctionsOnly = this.correctedAirports.filter(a => a.correctionStatus === 'corrected');
        fs.writeFileSync('corrections-made.json', JSON.stringify(correctionsOnly, null, 2));
        console.log('💾 Saved corrections only to corrections-made.json');

        // Count unverified airports
        const unverifiedCount = this.correctedAirports.filter(a => a.unverified === true).length;
        console.log(`💾 ${unverifiedCount} airports marked as unverified (no OpenFlights match)`);

        // Save summary
        const unverifiedAirports = this.correctedAirports.filter(a => a.unverified === true);

        const summary = {
            statistics: this.stats,
            totalAirports: this.correctedAirports.length,
            correctionsMade: correctionsOnly.length,
            unverifiedCount: unverifiedAirports.length,
            processedAt: new Date().toISOString(),
            sampleCorrections: correctionsOnly.slice(0, 10).map(a => ({
                original: a.originalData,
                corrected: {
                    airportCode: a.airportCode,
                    icaoCode: a.icaoCode,
                    airportName: a.airportName,
                    city: a.city,
                    country: a.country
                },
                corrections: a.corrections
            }))
        };

        fs.writeFileSync('correction-summary.json', JSON.stringify(summary, null, 2));
        console.log('💾 Saved summary to correction-summary.json');
    }

    async process() {
        try {
            console.log('🔧 Airport Data Corrector using OpenFlights\n');

            // Load data
            const yourAirports = this.loadData();
            if (!yourAirports) {
                return null;
            }

            // Process corrections
            this.processAirports(yourAirports);

            // Generate report
            this.generateReport();

            // Save results
            this.saveResults();

            console.log('\n✅ Correction process complete!');
            console.log('📁 Check the output files for corrected data and review');

            return this.correctedAirports;

        } catch (error) {
            console.error('Error in correction process:', error);
            return null;
        }
    }
}

// Main execution
async function main() {
    const corrector = new AirportCorrector();
    await corrector.process();
}

main().catch(console.error);

export { AirportCorrector }; 