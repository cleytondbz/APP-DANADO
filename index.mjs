// This file serves as the entry point for the Manus deployment
// It imports and runs the server
import('./api.js').catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
