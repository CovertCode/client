import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Metadata for the UI
export const meta = {
    name: "Git Pull",
    code: "git-pull",
    description: "Pulls latest code from repository",
    icon: "git-pull-request" // Icon name (optional usage)
};

// The Logic
export async function execute(args) {
    // You can hardcode paths or pass them via args
    // specific to your server setup
    const TARGET_DIR = args.path || process.cwd(); 

    try {
        const { stdout, stderr } = await execAsync('git pull', { cwd: TARGET_DIR });
        return { 
            output: stdout || "Already up to date.", 
            error: stderr 
        };
    } catch (e) {
        throw new Error(`Git Failed: ${e.message}`);
    }
}