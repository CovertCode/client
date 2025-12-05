import pm2 from 'pm2';

// Promisify PM2 methods for cleaner async/await usage
const connect = () => new Promise((resolve, reject) => {
    pm2.connect((err) => err ? reject(err) : resolve());
});

const list = () => new Promise((resolve, reject) => {
    pm2.list((err, list) => err ? reject(err) : resolve(list));
});

const execute = (action, processName) => new Promise((resolve, reject) => {
    // Only map safe actions
    const methods = {
        'start': pm2.start,
        'stop': pm2.stop,
        'restart': pm2.restart
    };

    if (!methods[action]) return reject(new Error('Invalid action'));

    methods[action].call(pm2, processName, (err, proc) => {
        if (err) return reject(err);
        resolve(proc);
    });
});

export async function getServicesStatus(allowedList) {
    await connect();
    const all = await list();
    
    // Filter only allowed services
    return all
        .filter(proc => allowedList.includes(proc.name))
        .map(proc => ({
            name: proc.name,
            status: proc.pm2_env.status,
            uptime: Date.now() - proc.pm2_env.pm_uptime,
            memory: proc.monit ? proc.monit.memory : 0,
            cpu: proc.monit ? proc.monit.cpu : 0
        }));
}

export async function runCommand(action, serviceName, allowedList) {
    if (!allowedList.includes(serviceName)) {
        throw new Error(`Service ${serviceName} is not in the allowlist.`);
    }
    await connect();
    return await execute(action, serviceName);
}