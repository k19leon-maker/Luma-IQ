import 'dotenv/config';
import { wordstatSyncService } from '../services/wordstat-sync.service';

wordstatSyncService.run()
  .then((result) => {
    console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, null, 2));
    process.exitCode = 1;
  });
