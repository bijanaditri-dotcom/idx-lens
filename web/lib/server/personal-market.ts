import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getMarket } from './market';
import { applyStockbitSnapshots,readStockbitSnapshots } from './stockbit-import';
export async function getPersonalMarket(){const data=await getMarket();if(process.env.AUTOMATIC_DATA_ONLY!=='false')return data;try{const user=await getChatGPTUser();return applyStockbitSnapshots(data,user?await readStockbitSnapshots(user.userId):[]);}catch{return {...applyStockbitSnapshots(data,[]),warnings:[...data.warnings,'Stockbit snapshot storage unavailable; live price/news data retained.']};}}
