import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanupOldArticles(daysToKeep: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const { data, error } = await supabase
    .from('articles')
    .delete()
    .lt('pub_date', cutoffDate.toISOString())
    .select('id');
  
  if (error) {
    console.error('Cleanup error:', error);
    return;
  }
  
  console.log(`Cleaned up ${data?.length || 0} old articles`);
}

cleanupOldArticles().catch(console.error);
