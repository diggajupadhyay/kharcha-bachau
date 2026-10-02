// Re-exported rather than imported directly by SettingsScreen: the library's button is
// a native view with no web build, so the browser resolves this module to
// GoogleSignInButton.web.tsx instead. Both present the same control.
export { GoogleSignInButton as default } from 'react-native-nitro-google-signin';
