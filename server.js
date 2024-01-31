const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cron = require('node-cron');

const app = express();
const port = 3000; // Set your desired port

// Initialize Firebase Admin SDK with your service account key
const serviceAccount = require('./service_account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Middleware to parse JSON and url-encoded data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Fitbit API credentials
const clientId = '23RVG8';
const clientSecret = '8cc63a70b16cd22f5cce1dfa7a67581e';

// Fitbit token endpoint
const tokenEndpoint = 'https://api.fitbit.com/oauth2/token';

// Function to refresh tokens using refresh token
async function refreshTokens(refreshToken) {
    const requestBody = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    };

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    };

    try {
        const response = await axios.post(tokenEndpoint, new URLSearchParams(requestBody).toString(), {
            headers,
        });

        // Return the obtained tokens
        console.log("token refreshed");
        return response.data;
    } catch (error) {
        console.error('Error refreshing tokens:', error);
        throw error;
    }
}

// Function to initialize both server and cron job
function initializeServerAndCron() {
    // Schedule the token refresh every 12 hours
    cron.schedule('0 */12 * * *', async () => {
    // cron.schedule('*/5 * * * *', async () => {
        try {
            // Retrieve records from Firestore
            const snapshot = await db.collection('tokens').get();

            // Iterate through each document in the collection
            const refreshPromises = snapshot.docs.map(async (doc) => {
                const { FitUserId, refreshToken, uid } = doc.data();

                // Use the refresh token to obtain new tokens
                const newTokens = await refreshTokens(refreshToken);

                // Update the Firestore record with the new tokens
                await doc.ref.update({
                    token: newTokens.access_token,
                    refreshToken: newTokens.refresh_token,
                });

                console.log(`Tokens refreshed for UID ${FitUserId}`);
            });

            // Wait for all refresh operations to complete
            await Promise.all(refreshPromises);
            console.log('all promises got');

        } catch (error) {
            console.error('Error refreshing tokens:', error);
        }
    });

    // Start the server
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}


initializeServerAndCron();