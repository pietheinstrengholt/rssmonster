import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../models/index.js';
import {
  listDeadProcessingJobs,
  requeueDeadProcessingJobs
} from '../services/jobs/processingJobOperator.js';

const scriptFile = fileURLToPath(import.meta.url);

const optionValues = argv => {
  const options = { jobIds: [] };
  for (let index = 1; index < argv.length; index++) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Missing value for ${option}`);
    }
    index++;
    if (option === '--user-id') options.userId = value;
    else if (option === '--job-id') options.jobIds.push(value);
    else if (option === '--type') options.type = value;
    else if (option === '--limit') options.limit = value;
    else throw new Error(`Unknown option: ${option}`);
  }
  return options;
};

export const parseProcessingJobOperatorArguments = argv => {
  const [command] = argv;
  if (!['list-dead', 'requeue-dead'].includes(command)) {
    throw new Error('Command must be list-dead or requeue-dead');
  }
  const options = optionValues(argv);
  if (!options.userId) throw new Error('--user-id is required');
  if (command === 'requeue-dead' && options.jobIds.length === 0) {
    throw new Error('requeue-dead requires at least one explicit --job-id');
  }
  if (command === 'requeue-dead' && (options.type || options.limit)) {
    throw new Error('requeue-dead accepts only --user-id and explicit --job-id targets');
  }
  return { command, ...options };
};

export const runProcessingJobOperator = async (argv = process.argv.slice(2)) => {
  const { command, userId, jobIds, type, limit } = parseProcessingJobOperatorArguments(argv);
  await db.sequelize.authenticate();
  try {
    return command === 'list-dead'
      ? await listDeadProcessingJobs({
          userId,
          jobIds,
          type,
          limit: limit || 20
        })
      : await requeueDeadProcessingJobs({ userId, jobIds });
  } finally {
    await db.sequelize.close();
  }
};

export const isProcessingJobOperatorEntryPoint = ({
  argv = process.argv,
  env = process.env
} = {}) => {
  const entryPath = env.pm_exec_path || argv[1];
  return Boolean(entryPath) && path.resolve(entryPath) === scriptFile;
};

if (isProcessingJobOperatorEntryPoint()) {
  try {
    console.log(JSON.stringify(await runProcessingJobOperator(), null, 2));
  } catch (error) {
    console.error(`[ProcessingJobs] Operator command failed: ${error.message}`);
    process.exitCode = 1;
  }
}
