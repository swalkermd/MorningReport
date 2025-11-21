async function testRss() {
    const url = 'https://www.espn.com/espn/rss/nba/news';
    console.log(`Fetching ${url}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            return;
        }
        const text = await response.text();
        console.log('Success! RSS Sample:');
        console.log(text.substring(0, 500) + '...');
    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

testRss();
