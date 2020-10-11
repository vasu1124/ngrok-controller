import { configure, getLogger } from "log4js";
import program from "commander";
import NgrokOperator  from './NgrokOperator';
import NgrokContoller from './NgrokController';

// ------------------------------------------------
// Parse command line options
// ------------------------------------------------
const version = process.env.npm_package_version || '0.0.0';

const cli = program
  .name("vasu1124/ngrok")
  .version(version, '-v, --version', 'output the current version')
  .usage("[Options]")
  .option("-l, --log <level>", "log level [ALL < TRACE < DEBUG < INFO < WARN < ERROR < FATAL < MARK < OFF]", "debug")
  .parse(process.argv);


// ------------------------------------------------
// Set global log level options
// ------------------------------------------------

const logger = getLogger("ngrok");
logger.level = cli.log;

logger.debug(cli.opts());

const main = async (options: any) => {
  const operator = new NgrokContoller(logger);
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