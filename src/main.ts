import { configure, getLogger } from "log4js";
import { Command } from 'commander';
import NgrokContoller from './NgrokController';

// ------------------------------------------------
// Parse command line options
// ------------------------------------------------
const { version } = require('../package.json') || '0.0.0';

const cli = new Command()
  .name("vasu1124/ngrok")
  .version(version, '-v, --version', 'output the current version')
  .usage("[Options]")
  .option("-l, --log <level>", "log level [ALL < TRACE < *DEBUG* < INFO < WARN < ERROR < FATAL < MARK < OFF]", "debug")
  .option("-i, --interval <ms>", "reconcile interval [60000]ms", "60000");

cli.parse(process.argv);


// ------------------------------------------------
// Set global options
// ------------------------------------------------

const logger = getLogger("ngrok");
logger.level = cli.opts().log;
let interval = Number(cli.opts().interval);
if (Number.isNaN(interval))
{
  interval = 60*1000;
  cli.opts().interval = `${interval}`;
}

logger.info(cli.opts());


const main = async (options: any) => {
  const operator = new NgrokContoller(logger, interval);
  await operator.start();

  const exit = (reason: string) => {
    logger.trace("exiting on " + reason);
    operator.stop();
    process.exit(0);
  };

  process
    .on('SIGTERM', () => exit('SIGTERM'))
    .on('SIGINT', () => exit('SIGINT'));
}


// ------------------------------------------------
// Start main method
// ------------------------------------------------

(async () => main({})
	.then(() => logger.trace("main done"))
	.catch(e => { logger.error("error in main: ", e); process.exit(1) })
)();