import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(supabase: any, userId: string) {
  const { data: tokenData, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !tokenData) {
    throw new Error('Google account not connected');
  }

  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt <= new Date()) {
    const refreshResult = await supabase.functions.invoke('refresh-google-token', {
      body: { userId }
    });
    
    if (refreshResult.error || !refreshResult.data?.access_token) {
      throw new Error('Failed to refresh token');
    }
    
    return refreshResult.data.access_token;
  }

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { intent, userId, traceId, action } = await req.json();
    
    console.log(`[${traceId}] Tasks action: ${action}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const accessToken = await getAccessToken(supabase, userId);
    let message = '';

    if (action === 'create') {
      const { title, notes, due } = intent.entities;
      
      // Get default task list
      const listResponse = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        throw new Error('Failed to fetch task lists');
      }

      const listData = await listResponse.json();
      const defaultList = listData.items?.[0]?.id;

      if (!defaultList) {
        throw new Error('No task list found');
      }

      // Create task
      const taskBody: any = { title };
      if (notes) taskBody.notes = notes;
      if (due) taskBody.due = due;

      const createResponse = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${defaultList}/tasks`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskBody),
        }
      );

      if (!createResponse.ok) {
        throw new Error('Failed to create task');
      }

      message = `✅ Task created: "${title}"`;
      if (due) {
        const dueDate = new Date(due).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        message += ` (due ${dueDate})`;
      }

    } else if (action === 'complete') {
      const { taskTitle, taskId } = intent.entities;
      
      // Get all task lists
      const listResponse = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        throw new Error('Failed to fetch task lists');
      }

      const listData = await listResponse.json();
      const lists = listData.items || [];

      // Search for the task across all lists
      let targetTask: any = null;
      let targetList: string = '';

      if (taskId) {
        // If taskId provided, search for it
        for (const list of lists) {
          const tasksResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks/${taskId}`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          if (tasksResponse.ok) {
            targetTask = await tasksResponse.json();
            targetList = list.id;
            break;
          }
        }
      } else if (taskTitle) {
        // Search by title
        for (const list of lists) {
          const tasksResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          const tasksData = await tasksResponse.json();
          const tasks = tasksData.items || [];
          
          const match = tasks.find((t: any) => 
            t.title.toLowerCase().includes(taskTitle.toLowerCase())
          );
          
          if (match) {
            targetTask = match;
            targetList = list.id;
            break;
          }
        }
      }

      if (!targetTask || !targetList) {
        message = `❌ Task "${taskTitle || taskId}" not found.`;
      } else {
        // Mark task as completed
        const updateResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${targetList}/tasks/${targetTask.id}`,
          {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'completed',
              completed: new Date().toISOString()
            }),
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to complete task');
        }

        message = `✅ Task completed: "${targetTask.title}"`;
      }

    } else if (action === 'read') {
      // Get all task lists
      const listResponse = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        throw new Error('Failed to fetch task lists');
      }

      const listData = await listResponse.json();
      const lists = listData.items || [];

      // Get tasks from all lists
      const allTasks = await Promise.all(
        lists.map(async (list: any) => {
          const tasksResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          const tasksData = await tasksResponse.json();
          return {
            listName: list.title,
            tasks: tasksData.items || []
          };
        })
      );

      const totalTasks = allTasks.reduce((sum, l) => sum + l.tasks.length, 0);

      if (totalTasks === 0) {
        message = '✅ No pending tasks. You\'re all caught up!';
      } else {
        message = `📋 **Your Tasks** (${totalTasks} pending)\n\n`;
        
        allTasks.forEach(({ listName, tasks }) => {
          if (tasks.length > 0) {
            message += `**${listName}**\n`;
            tasks.slice(0, 5).forEach((task: any) => {
              message += `• ${task.title}`;
              if (task.due) {
                const dueDate = new Date(task.due).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                });
                message += ` (${dueDate})`;
              }
              message += '\n';
            });
            message += '\n';
          }
        });

        if (totalTasks > 5) {
          message += `_...and ${totalTasks - 5} more tasks_`;
        }
      }
    } else {
      message = 'Tasks action not yet implemented';
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-tasks:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `⚠️ Failed to process task request: ${errorMessage}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});