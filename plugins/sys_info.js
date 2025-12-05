import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);

export const meta = {
    name: "System Stats",
    code: "sys-stats",
    description: "Check Disk & RAM usage"
};

export async function execute() {
    // Linux commands to get stats
    const disk = await execAsync('df -h / | tail -1');
    const free = await execAsync('free -m | grep Mem');

    return {
        output: `DISK:\n${disk.stdout}\nRAM:\n${free.stdout}`
    };
}