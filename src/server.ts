import express, { Request, Response } from 'express';
import { exec } from 'child_process';

const app: express.Express = express();
// Use a port from .env or default to 3001 to avoid common conflicts (e.g. with React dev server on 3000)
const PORT = process.env.API_PORT || 3001;

app.use(express.json()); // Middleware to parse JSON request bodies

/**
 * Executes a shell command and sends the output as a JSON response.
 * @param scriptName The name of the script to run (e.g., 'seed', 'update', 'reset').
 * @param res The Express response object.
 */
const executeScriptAndWait = (scriptName: string, res: Response) => {
  const command = `pnpm run ${scriptName}`;
  console.log(`[API] Received request to execute script: ${scriptName}`);
  console.log(`[API] Executing command: ${command}`);

  // Execute the command. process.cwd() ensures it runs in the project root.
  exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[API] Error executing script '${scriptName}': ${error.message}`);
      if (stdout) console.log(`[API] stdout from '${scriptName}':\n${stdout}`);
      if (stderr) console.error(`[API] stderr from '${scriptName}':\n${stderr}`);
      
      res.status(500).json({
        message: `Error executing script '${scriptName}'.`,
        error: error.message,
        stdout: stdout,
        stderr: stderr,
      });
      return;
    }

    console.log(`[API] Script '${scriptName}' finished successfully.`);
    if (stdout) console.log(`[API] stdout from '${scriptName}':\n${stdout}`);
    if (stderr) console.warn(`[API] stderr (warnings) from '${scriptName}':\n${stderr}`); // stderr might contain warnings

    res.status(200).json({
      message: `Script '${scriptName}' executed successfully.`,
      stdout: stdout,
      stderr: stderr,
    });
  });
};

// Define API endpoints
app.post('/seed', (req: Request, res: Response) => {
  executeScriptAndWait('seed', res);
});

app.post('/update', (req: Request, res: Response) => {
  executeScriptAndWait('update', res);
});

app.post('/reset', (req: Request, res: Response) => {
  executeScriptAndWait('reset', res);
});

// Default route for health check or basic info
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Data Pipeline API is running.',
    availableEndpoints: {
      seed: 'POST /seed',
      update: 'POST /update',
      reset: 'POST /reset',
    },
  });
});

app.listen(PORT, () => {
  console.log(`[API] Server listening on port ${PORT}`);
  console.log(`[API] Available endpoints:`);
  console.log(`  GET  /`);
  console.log(`  POST /seed`);
  console.log(`  POST /update`);
  console.log(`  POST /reset`);
  console.log(`\nExample curl commands:`);
  console.log(`  curl -X POST http://localhost:${PORT}/seed`);
  console.log(`  curl -X POST http://localhost:${PORT}/update`);
  console.log(`  curl -X POST http://localhost:${PORT}/reset`);
});

export default app; // Export for potential testing or programmatic use
