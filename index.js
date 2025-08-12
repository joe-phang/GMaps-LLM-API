// -----------------------------------------------------------------------------
// --- LLM Google Maps Backend API ---
// This Express.js server provides tools for an LLM to interact with Google Maps.
// It includes endpoints for finding places, getting directions, and getting the time.
// -----------------------------------------------------------------------------

// --- 1. Import Dependencies ---
require('dotenv').config(); // Loads environment variables from a .env file
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');

// --- 2. Initialize Application and Clients ---
const app = express();
const gmapsClient = new Client({});

// Middleware to parse JSON bodies from incoming requests
app.use(express.json());

// --- 3. Define Constants ---
const PORT = process.env.PORT || 5002;
const DEFAULT_LOCATION = "Batam, Riau Islands, Indonesia"; // Default location context

// --- 4. API Endpoints (The "Tools") ---

/**
 * @tool    /find_places
 * @desc    Finds places based on a query (e.g., "restaurants") near a location.
 * @method  POST
 * @body    { "query": "seafood restaurants", "location": "Nagoya Hill" }
 */
app.post('/find_places', async (req, res) => {
    const { query, location } = req.body;

    // Input validation
    if (!query) {
        return res.status(400).json({ error: "A 'query' is required in the request body." });
    }

    try {
        // Use the provided location, or fall back to the default if it's "near me" or not provided.
        const searchAddress = (!location || location.toLowerCase().includes("near me")) ? DEFAULT_LOCATION : location;

        // First, get the coordinates for the search address (e.g., "Nagoya Hill" -> lat/lng)
        const geocodeResponse = await gmapsClient.geocode({
            params: {
                address: searchAddress,
                key: process.env.GOOGLE_MAPS_API_KEY,
            },
        });

        if (geocodeResponse.data.results.length === 0) {
            return res.status(404).json({ error: `Could not find the location: ${searchAddress}` });
        }
        const searchLocationCoords = geocodeResponse.data.results[0].geometry.location;

        // Now, find places using the query and the coordinates we found.
        const placesResponse = await gmapsClient.textSearch({
            params: {
                query: query,
                location: searchLocationCoords,
                key: process.env.GOOGLE_MAPS_API_KEY,
            },
        });

        if (placesResponse.data.results.length > 0) {
            // For simplicity, we'll format and return the top 3 results.
            const topResults = placesResponse.data.results.slice(0, 3).map(place => ({
                name: place.name,
                address: place.formatted_address,
                rating: place.rating || 'No rating',
                status: place.business_status || 'UNKNOWN',
                map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.place_id}`,
            }));

            res.json(topResults);
        } else {
            res.status(404).json({ message: `No places found for '${query}' near '${searchAddress}'.` });
        }
    } catch (error) {
        console.error("Error in /find_places:", error.message);
        res.status(500).json({ error: "An internal server error occurred while finding places." });
    }
});

/**
 * @tool    /get_directions
 * @desc    Gets directions between an origin and a destination.
 * @method  POST
 * @body    { "origin": "Batam Centre Ferry Terminal", "destination": "Nagoya Hill Mall" }
 */
app.post('/get_directions', async (req, res) => {
    const { origin, destination } = req.body;

    // Input validation
    if (!origin || !destination) {
        return res.status(400).json({ error: "Both 'origin' and 'destination' are required." });
    }

    try {
        const directionsResponse = await gmapsClient.directions({
            params: {
                origin: origin,
                destination: destination,
                key: process.env.GOOGLE_MAPS_API_KEY,
            },
        });

        if (directionsResponse.data.routes.length > 0) {
            const route = directionsResponse.data.routes[0];
            const leg = route.legs[0];

            // Format a simple, clean response for the LLM.
            const formattedResponse = {
                summary: route.summary,
                distance: leg.distance.text,
                duration: leg.duration.text,
                start_address: leg.start_address,
                end_address: leg.end_address,
                directions_url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
            };
            res.json(formattedResponse);
        } else {
            res.status(404).json({ message: `Could not find directions from '${origin}' to '${destination}'.` });
        }
    } catch (error) {
        console.error("Error in /get_directions:", error.message);
        res.status(500).json({ error: "An internal server error occurred while getting directions." });
    }
});


/**
 * @tool    /get_current_time
 * @desc    Gets the current time for the server's location.
 * @method  GET
 */
app.get('/get_current_time', (req, res) => {
    try {
        const now = new Date();
        const timeZone = 'Asia/Jakarta'; // WIB (Western Indonesia Time)
        const options = {
            timeZone: timeZone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };

        const formattedTime = new Intl.DateTimeFormat('en-US', options).format(now);

        res.json({
            current_time: formattedTime,
            timezone: timeZone,
            location: DEFAULT_LOCATION
        });
    } catch (error) {
        console.error("Error in /get_current_time:", error.message);
        res.status(500).json({ error: "An internal server error occurred while getting the time." });
    }
});


// --- 5. Start the Server ---
app.listen(PORT, () => {
    console.log(`✅ LLM Maps Backend is running on http://localhost:${PORT}`);
    console.log("Available tools:");
    console.log(`  - POST /find_places`);
    console.log(`  - POST /get_directions`);
    console.log(`  - GET  /get_current_time`);
});
