import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function initSources() {
  try {
    const sourcesPath = join(__dirname, '../../config/sources.json');
    const sourcesData = JSON.parse(readFileSync(sourcesPath, 'utf-8'));
    
    console.log(`Loading ${sourcesData.sources.length} sources...`);
    
    for (const source of sourcesData.sources) {
      const { error } = await supabase
        .from('sources')
        .upsert({
          id: source.id,
          name: source.name,
          url: source.url,
          type: source.type,
          category: source.category,
          priority: source.priority,
          weight: source.weight,
          rss: source.rss || null,
          selector: source.selector || null,
          active: source.active
        }, { onConflict: 'id' });
      
      if (error) {
        console.error(`Failed to insert source ${source.id}:`, error);
      } else {
        console.log(`✓ ${source.name}`);
      }
    }
    
    console.log('\n✅ Sources initialized successfully!');
    
    // Verify
    const { count, error: countError } = await supabase
      .from('sources')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Failed to count sources:', countError);
    } else {
      console.log(`Total sources in DB: ${count}`);
    }
    
  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  }
}

initSources();
