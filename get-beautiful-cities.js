// get-beautiful-cities.js

import fs from 'fs';

// 1. Load your countries list
let countries;
try {
    countries = JSON.parse(fs.readFileSync('countries.json', 'utf8'));
} catch (err) {
    console.error('❌ countries.json parse error:', err.message);
    process.exit(1);
}

async function getCities(country) {
    const prompt = `List up to 10 beautiful or famous cities in ${country}. Return the result as a comma-separated list. Be very concise. Reply with the cities names, nothing else. if you have a problem finding the country or cities, just replay with the world null.`;
    try {
        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama2',
                prompt,
                stream: false
            })
        });
        const data = await res.json();
        if (!data.response) throw new Error('no response');
        return data.response
            .split(',')
            .map(c => c.trim())
            .filter(Boolean);
    } catch (err) {
        console.error(`⚠️  ${country}:`, err.message);
        return [];
    }
}

(async () => {
    const out = [];
    for (let i = 0; i < countries.length; i++) {
        const country = countries[i];
        console.log(`(${i + 1}/${countries.length}) Fetching for ${country}`);
        const cities = await getCities(country);
        out.push({ country, cities });
        await new Promise(r => setTimeout(r, 1500));
    }
    fs.writeFileSync('beautiful-cities.json', JSON.stringify(out, null, 2));
    console.log('✅ Done → beautiful-cities.json');
})();
