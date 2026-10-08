import 'server-only';
import { notFound } from 'next/navigation';
import SuzukaComparison from '../../../features/race/prototype/comparison';
import { prototypeEnabled, type PrototypeReplay } from '../../../features/race/prototype/model';
import replay from '../../../features/race/prototype/replay.json';
export const dynamic = 'force-dynamic';
/** Opt-in AND development-only. No career queries, actions, save access or runtime simulation. */
export default function SuzukaPrototype() {
    if (!prototypeEnabled(process.env.NODE_ENV, process.env.ENABLE_SUZUKA_PROTOTYPE)) notFound();
    return <SuzukaComparison replay={replay as PrototypeReplay}/>;
}
