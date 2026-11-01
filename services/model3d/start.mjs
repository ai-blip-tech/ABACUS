// PM2 imports ESM through its process wrapper, so process.argv[1] is not server.mjs.
import {startModelService} from './server.mjs';
startModelService();
