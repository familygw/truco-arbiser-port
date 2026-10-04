import fs from 'node:fs';
import path from 'node:path';
import {runDosMatch,replayDosMatch} from '../src/original-seeded-match.ts';
const args=process.argv.slice(2);
const result=args[0]?.endsWith('.json')?replayDosMatch(JSON.parse(fs.readFileSync(args[0],'utf8'))):runDosMatch({seed:args[0]===undefined?327680:Number(args[0]),flor:!args.includes('--sin-flor'),cpuMano:!args.includes('--jugador-mano')});
const out=path.resolve(args.find(a=>a.startsWith('--out='))?.slice(6)??`replays/dos-${result.replay.seed}.json`);
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result.replay,null,2)+'\n');
console.log(`Semilla ${result.replay.seed}: Vos ${result.score.player} – CPU ${result.score.cpu}; ${result.events.filter(e=>e.cards).length} manos, ${result.replay.inputs.length} comandos, ${result.draws} sorteos.\nReplay: ${out}`);
