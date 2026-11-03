// Only enable after the functions, deletion-lock rules, Google web origins,
// and a dedicated test account have been verified in house-of-japan.
// This OAuth client ID is public and comes from the app's google-services.json.
export const deletionConfig = Object.freeze({
  enabled: true,
  projectId: "house-of-japan",
  googleClientId: "578273190619-4ubttsqsni0u3vgbfevjkt4ajidh7vvv.apps.googleusercontent.com",
  functionsOrigin: "https://us-central1-house-of-japan.cloudfunctions.net",
});
