import { Graph, RoutingModule } from '../common/interfaces';
import { RuntimeMap } from './interfaces';

const template = require('lodash.template');
const runtimeTemplate = require('./runtime.tpl');

export interface PrefetchConfig {
  '4g': number;
  '3g': number;
  '2g': number;
  'slow-2g': number;
}

export interface RuntimePrefetchConfig {
  debug?: boolean;
  data: Graph;
  basePath?: string;
  prefetchConfig?: PrefetchConfig;
  routes: RoutingModule[];
}

export class RuntimePrefetchPlugin {
  private _debug: boolean;

  constructor(private _config: RuntimePrefetchConfig) {
    this._debug = !!_config.debug;
    if (!_config.data) {
      throw new Error('Page graph not provided');
    }
  }

  apply(compiler: any) {
    const fileChunk: { [path: string]: string } = {};

    compiler.plugin('emit', (compilation: any, cb: any) => {
      compilation.chunks.forEach((chunk: any) => {
        if (chunk.blocks && chunk.blocks.length > 0) {
          for (const block of chunk.blocks) {
            fileChunk[block.dependencies[0].request] = chunk.id + '.chunk.js';
          }
        }
      });

      const newConfig: any = {};
      const graph = buildMap(this._config.routes, this._config.data);
      Object.keys(graph).forEach(c => {
        newConfig[c] = [];
        graph[c].forEach(p => {
          const newTransition = Object.assign({}, p);
          newTransition.chunk = fileChunk[p.file];
          delete newTransition.file;
          newConfig[c].push(newTransition);
        });
      });

      const old = compilation.assets['main.bundle.js'];
      const prefetchLogic = template(runtimeTemplate)({
        BASE_PATH: this._config.basePath || '/',
        GRAPH: JSON.stringify(newConfig),
        THRESHOLDS: JSON.stringify(this._config.prefetchConfig || defaultPrefetchConfig)
      });
      const result = prefetchLogic + '\n' + old.source();
      compilation.assets['main.bundle.js'] = {
        source() {
          return result;
        },
        size() {
          return result.length;
        }
      };
      cb();
    });
  }
}

const defaultPrefetchConfig: PrefetchConfig = {
  '4g': 0.15,
  '3g': 0.3,
  '2g': 0.45,
  'slow-2g': 0.6
};

const buildMap = (routes: RoutingModule[], graph: Graph) => {
  const result: RuntimeMap = {};
  const routeFile = {} as { [key: string]: string };
  routes.forEach(r => {
    routeFile[r.path] = r.modulePath;
  });
  Object.keys(graph).forEach(k => {
    result[k] = [];

    const sum = Object.keys(graph[k]).reduce((a, n) => a + graph[k][n], 0);
    Object.keys(graph[k]).forEach(n => {
      result[k].push({
        route: n,
        probability: graph[k][n] / sum,
        file: routeFile[n]
      });
    });
    result[k] = result[k].sort((a, b) => b.probability - a.probability);
  });
  return result;
};
