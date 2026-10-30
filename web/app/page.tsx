import { Dashboard } from '@/components/dashboard/dashboard';
import { getPersonalMarket } from '@/lib/server/personal-market';
export const dynamic='force-dynamic';
export default async function Home(){let initialData=null;try{initialData=await getPersonalMarket();}catch{}return <Dashboard initialData={initialData}/>;}
