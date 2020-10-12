import { configure, getLogger } from "log4js";
import program from "commander";
import NgrokContoller from './NgrokController';

// ------------------------------------------------
// Parse command line options
// ------------------------------------------------
const { version } = require('../package.json') || '0.0.0';

const cli = program
  .name("vasu1124/ngrok")
  .version(version, '-v, --version', 'output the current version')
  .usage("[Options]")
  .option("-l, --log <level>", "log level [ALL < TRACE < *DEBUG* < INFO < WARN < ERROR < FATAL < MARK < OFF]", "debug")
  .option("-i, --interval <ms>", "reconcile interval [60000]ms", "60000")
  .parse(process.argv);


// ------------------------------------------------
// Set global options
// ------------------------------------------------

const logger = getLogger("ngrok");
logger.level = cli.log;
let interval = Number(cli.interval);
if (Number.isNaN(interval))
{
  interval = 60*1000;
  cli.interval = `${interval}`;
}

logger.debug(cli.opts());


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