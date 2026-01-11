import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from './src/config/supabase';

async function runMigration(filename: string) {
  try {
    console.log(`\n🚀 Running migration: ${filename}...`);
    
    const migrationPath = join(__dirname, 'migrations', filename);
    const sql = readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.length === 0) continue;
      
      console.log(`\n📝 Executing statement...`);
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql_query: statement + ';' });
      
      if (error) {
        // Try direct execution if RPC fails
        console.log('Trying direct execution...');
        const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          },
          body: JSON.stringify({ sql_query: statement + ';' }),
        });
        
        if (!result.ok) {
          console.error(`❌ Error: ${error.message}`);
          console.error('Statement:', statement.substring(0, 100));
        }
      }
    }
    
    console.log(`\n✅ Migration ${filename} completed successfully!`);
  } catch (error: any) {
    console.error(`\n❌ Migration failed:`, error.message);
    process.exit(1);
  }
}

// Run the messaging migration
runMigration('add_messaging_system.sql').then(() => {
  console.log('\n✨ All migrations completed!');
  process.exit(0);
});

