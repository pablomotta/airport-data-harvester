import fs from 'fs';

function cleanCityName(cityText) {
    if (!cityText || typeof cityText !== 'string') return null;

    // Remove common prefixes and patterns
    let cleaned = cityText
        // Remove numbered list patterns (1. 2. 3. etc.)
        .replace(/^\d+\.\s*/, '')
        // Remove introductory text
        .replace(/^Sure! Here are \d+ beautiful or famous cities in .+?:\s*/i, '')
        .replace(/^Here are \d+ beautiful or famous cities in .+?:\s*/i, '')
        // Remove newlines and extra whitespace
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        // Remove "and" at the beginning or end
        .replace(/^and\s+/i, '')
        .replace(/\s+and\.?$/i, '')
        // Remove trailing periods and commas
        .replace(/[.,]+$/, '')
        .trim();

    // Skip if it's too long (likely descriptive text, not a city name)
    if (cleaned.length > 50) return null;

    // Skip if it contains typical non-city phrases
    const skipPatterns = [
        /^(sure|here|sorry|but|there|the|and|or|this|that|with|from|to|in|of|for|as|on|at|by)/i,
        /territory|country|republic|kingdom|island|ocean|administration|government/i,
        /beautiful|famous|cities|list|cannot|provide|recognized|located/i
    ];

    for (const pattern of skipPatterns) {
        if (pattern.test(cleaned)) return null;
    }

    // Return cleaned city name if it looks valid
    return cleaned || null;
}

function extractCitiesFromArray(citiesArray) {
    if (!Array.isArray(citiesArray)) return [];

    // Check if this is an invalid entry (starts with "Sorry")
    if (citiesArray.length > 0 && citiesArray[0].toLowerCase().includes('sorry')) {
        return null; // This indicates the entire country should be removed
    }

    const cities = [];

    for (const cityText of citiesArray) {
        if (typeof cityText !== 'string') continue;

        // Handle single entries that might contain multiple cities
        if (cityText.includes('\n') && cityText.includes('.')) {
            // This looks like a numbered list in a single string
            const lines = cityText.split('\n');
            for (const line of lines) {
                const cleaned = cleanCityName(line);
                if (cleaned) cities.push(cleaned);
            }
        } else {
            // Handle as single city or comma-separated list
            const cleaned = cleanCityName(cityText);
            if (cleaned) {
                // Check if it might contain multiple cities separated by commas
                if (cleaned.includes(',') && !cleaned.includes('(')) {
                    const parts = cleaned.split(',').map(part => part.trim());
                    for (const part of parts) {
                        const partCleaned = cleanCityName(part);
                        if (partCleaned) cities.push(partCleaned);
                    }
                } else {
                    cities.push(cleaned);
                }
            }
        }
    }

    // Remove duplicates and filter out invalid entries
    const uniqueCities = [...new Set(cities)]
        .filter(city => city && city.length >= 2)
        .sort();

    return uniqueCities;
}

function cleanBeautifulCitiesData() {
    try {
        console.log('Reading beautiful-cities.json...');
        const data = JSON.parse(fs.readFileSync('beautiful-cities.json', 'utf8'));

        console.log(`Processing ${data.length} countries...`);

        const cleanedData = [];
        let removedCount = 0;
        let cleanedCount = 0;

        for (const entry of data) {
            const cities = extractCitiesFromArray(entry.cities);

            if (cities === null) {
                // Invalid entry (starts with "Sorry"), skip it
                removedCount++;
                console.log(`Removed: ${entry.country} (no valid cities)`);
            } else if (cities.length === 0) {
                // No cities found after cleaning
                removedCount++;
                console.log(`Removed: ${entry.country} (no cities after cleaning)`);
            } else {
                // Valid entry with cities
                cleanedData.push({
                    country: entry.country,
                    cities: cities
                });
                cleanedCount++;
                console.log(`Cleaned: ${entry.country} (${cities.length} cities)`);
            }
        }

        console.log(`\nSummary:`);
        console.log(`- Original countries: ${data.length}`);
        console.log(`- Cleaned countries: ${cleanedCount}`);
        console.log(`- Removed countries: ${removedCount}`);
        console.log(`- Total cities found: ${cleanedData.reduce((sum, entry) => sum + entry.cities.length, 0)}`);

        // Write cleaned data
        fs.writeFileSync('beautiful-cities-cleaned.json', JSON.stringify(cleanedData, null, 2));
        console.log('\nCleaned data saved to beautiful-cities-cleaned.json');

        // Also create a backup of original
        fs.writeFileSync('beautiful-cities-backup.json', fs.readFileSync('beautiful-cities.json'));
        console.log('Original data backed up to beautiful-cities-backup.json');

        return cleanedData;

    } catch (error) {
        console.error('Error processing file:', error);
        return null;
    }
}

// Run the cleaning process
cleanBeautifulCitiesData();

export { cleanBeautifulCitiesData, cleanCityName, extractCitiesFromArray }; 