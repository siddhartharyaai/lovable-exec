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
      const { taskTitle, taskId, taskIndex, completeBoth } = intent.entities;
      
      console.log(`[${traceId}] Complete task: title="${taskTitle}", id="${taskId}", index="${taskIndex}", both="${completeBoth}"`);
      
      // PRIORITY 1: If taskIndex provided, use snapshot
      if (taskIndex !== undefined && taskIndex !== null) {
        const { data: sessionData } = await supabase
          .from('session_state')
          .select('tasks_snapshot')
          .eq('user_id', userId)
          .single();
        
        const snapshot = sessionData?.tasks_snapshot;
        if (!snapshot || !snapshot.list) {
          message = `❌ I don't have a recent task list. Please say "show my tasks" first.`;
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const taskFromSnapshot = snapshot.list.find((t: any) => t.index === parseInt(taskIndex));
        if (!taskFromSnapshot) {
          message = `❌ I couldn't find task ${taskIndex} in your list. Try "show my tasks" to see current tasks.`;
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Mark task complete using snapshot data
        const updateResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${taskFromSnapshot.listId}/tasks/${taskFromSnapshot.id}`,
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

        message = `✅ Task ${taskFromSnapshot.index} completed: "${taskFromSnapshot.title}"`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // PRIORITY 2: Check if we're completing "both" duplicates
      if (completeBoth === true || (typeof taskTitle === 'string' && taskTitle.toLowerCase() === 'both')) {
        // Retrieve disambiguation state from session
        const { data: sessionData } = await supabase
          .from('session_state')
          .select('pending_disambiguation')
          .eq('user_id', userId)
          .single();
        
        const pendingMatches = sessionData?.pending_disambiguation?.matches;
        if (!pendingMatches || pendingMatches.length === 0) {
          message = `❌ I don't have any pending task disambiguation. Please specify the task again.`;
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`[${traceId}] Completing ${pendingMatches.length} duplicate tasks`);
        let completedCount = 0;
        
        for (const match of pendingMatches) {
          const updateResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${match.listId}/tasks/${match.task.id}`,
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
          
          if (updateResponse.ok) {
            completedCount++;
          }
        }
        
        // Clear disambiguation state
        await supabase
          .from('session_state')
          .update({ 
            pending_disambiguation: null,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
        
        message = `✅ Completed ${completedCount} task${completedCount > 1 ? 's' : ''}: "${pendingMatches[0].task.title}"`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // PRIORITY 3: Search by title/id (existing logic)
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
      const matchingTasks: any[] = [];

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
        // Search by title with intelligent fuzzy matching
        console.log(`[${traceId}] Searching for task: "${taskTitle}"`);
        
        for (const list of lists) {
          const tasksResponse = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          const tasksData = await tasksResponse.json();
          const tasks = (tasksData.items || []).filter((t: any) => t.status !== 'completed');
          
          // Find all fuzzy matches
          const matches = tasks.filter((t: any) => {
            const taskLower = t.title.toLowerCase();
            const searchLower = taskTitle.toLowerCase();
            return taskLower.includes(searchLower) || searchLower.includes(taskLower);
          });
          
          matches.forEach((match: any) => {
            matchingTasks.push({ task: match, listId: list.id, listName: list.title });
          });
        }
        
        console.log(`[${traceId}] Found ${matchingTasks.length} matching tasks`);
        
        if (matchingTasks.length === 1) {
          targetTask = matchingTasks[0].task;
          targetList = matchingTasks[0].listId;
        } else if (matchingTasks.length > 1) {
          // Multiple matches - store for disambiguation and ask for clarification
          await supabase
            .from('session_state')
            .upsert({
              user_id: userId,
              pending_disambiguation: {
                action: 'complete_task',
                matches: matchingTasks,
                timestamp: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });
          
          message = `📋 I found **${matchingTasks.length} matching tasks** with that name:\n\n`;
          matchingTasks.forEach((item: any, i: number) => {
            message += `${i + 1}. **${item.task.title}**`;
            if (item.task.due) {
              const dueDate = new Date(item.task.due).toLocaleDateString('en-IN', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              });
              message += ` (due ${dueDate})`;
            }
            if (item.listName) {
              message += `\n   _${item.listName}_`;
            }
            message += '\n\n';
          });
          message += `Reply with "1", "2", or "both" to complete them.`;
          
          return new Response(JSON.stringify({ message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (!targetTask || !targetList) {
        message = `❌ I couldn't find a task matching "${taskTitle || taskId}". \n\nTry:\n• "Show my tasks" to see what's on your list\n• Being more specific about the task name`;
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

    } else if (action === 'read' || action === 'read_all') {
      const showAll = action === 'read_all' || intent.entities?.show_all === true;
      const showRest = intent.entities?.show_rest === true;
      
      console.log(`[${traceId}] Tasks read action: showAll=${showAll}, showRest=${showRest}`);
      
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

      // Fetch all tasks with pagination (up to 50 per list)
      const allTasksSnapshot: any[] = [];
      let taskIndex = 1;
      
      for (const list of lists) {
        let pageToken: string | undefined = undefined;
        let tasksInList = 0;
        
        do {
          let url = `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&maxResults=100`;
          if (pageToken) {
            url += `&pageToken=${pageToken}`;
          }
          
          const tasksResponse = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          
          if (!tasksResponse.ok) {
            console.error(`[${traceId}] Failed to fetch tasks for list ${list.id}`);
            break;
          }
          
          const tasksData = await tasksResponse.json();
          const tasks = tasksData.items || [];
          
          tasks.forEach((task: any) => {
            if (tasksInList < 50) { // Cap at 50 tasks per list
              allTasksSnapshot.push({
                index: taskIndex++,
                id: task.id,
                listId: list.id,
                listName: list.title,
                title: task.title,
                due: task.due || null,
                notes: task.notes || null,
                updated: task.updated || null
              });
              tasksInList++;
            }
          });
          
          pageToken = tasksData.nextPageToken;
          
          // Stop if we've hit 50 tasks for this list
          if (tasksInList >= 50) {
            break;
          }
        } while (pageToken);
      }
      
      const totalTasks = allTasksSnapshot.length;
      console.log(`[${traceId}] Fetched ${totalTasks} total tasks across ${lists.length} lists`);
      
      // Store snapshot in session_state
      await supabase
        .from('session_state')
        .upsert({
          user_id: userId,
          tasks_snapshot: {
            list: allTasksSnapshot,
            timestamp: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });
      
      console.log(`[${traceId}] Stored tasks snapshot in session_state`);

      if (totalTasks === 0) {
        message = '✅ No pending tasks. You\'re all caught up!';
      } else {
        const displayLimit = showAll ? totalTasks : 10;
        const startIndex = showRest ? 10 : 0;
        const tasksToShow = allTasksSnapshot.slice(startIndex, startIndex + displayLimit);
        
        // CRITICAL: Header depends on view type
        if (showRest) {
          // Follow-up paging: "Okay, here are the next X tasks:"
          message = `Okay, here are the next ${tasksToShow.length} tasks:\n\n`;
        } else {
          // Initial or full listing: "✅ *Your Tasks* (N pending)"
          message = `✅ *Your Tasks* (${totalTasks} pending)\n\n`;
        }
        
        // Group by list
        const tasksByList: Record<string, any[]> = {};
        tasksToShow.forEach(task => {
          if (!tasksByList[task.listName]) {
            tasksByList[task.listName] = [];
          }
          tasksByList[task.listName].push(task);
        });
        
        Object.entries(tasksByList).forEach(([listName, tasks]) => {
          message += `*${listName}*\n`;
          tasks.forEach((task: any) => {
            message += `${task.index}. ${task.title}`;
            if (task.due) {
              const dueDate = new Date(task.due).toLocaleDateString('en-IN', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              });
              message += ` (due ${dueDate})`;
            }
            message += '\n';
          });
          message += '\n';
        });

        // CRITICAL: Footer logic
        if (showAll) {
          // "Show all tasks" mode: NO footer at all
          // Do nothing
        } else if (showRest) {
          // "Show rest" mode: check if there are even more tasks beyond this page
          const endIndex = startIndex + tasksToShow.length;
          if (totalTasks > endIndex) {
            const remaining = totalTasks - endIndex;
            message += `...and ${remaining} more task${remaining > 1 ? 's' : ''}.\n`;
            message += `Reply "show me all tasks" to see the complete list.`;
          }
        } else {
          // Initial view (first 10): show footer if more than 10 tasks
          if (totalTasks > 10) {
            const remaining = totalTasks - 10;
            message += `...and ${remaining} more task${remaining > 1 ? 's' : ''}.\n`;
            message += `Reply "show me all tasks" or "show me the rest" to see the full list.`;
          }
        }
      }

    } else if (action === 'update') {
      const { taskTitle, newTitle, newNotes, newDue } = intent.entities;
      
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

      // Search for the task across all lists with intelligent matching
      let targetTask: any = null;
      let targetList: string = '';
      const matchingTasks: any[] = [];
      
      console.log(`[${traceId}] Searching for task: "${taskTitle}"`);

      for (const list of lists) {
        const tasksResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        const tasksData = await tasksResponse.json();
        const tasks = (tasksData.items || []).filter((t: any) => t.status !== 'completed');
        
        // Find all fuzzy matches
        const matches = tasks.filter((t: any) => {
          const taskLower = t.title.toLowerCase();
          const searchLower = taskTitle.toLowerCase();
          return taskLower.includes(searchLower) || searchLower.includes(taskLower);
        });
        
        matches.forEach((match: any) => {
          matchingTasks.push({ task: match, listId: list.id, listName: list.title });
        });
      }
      
      console.log(`[${traceId}] Found ${matchingTasks.length} matching tasks`);
      
      if (matchingTasks.length === 1) {
        targetTask = matchingTasks[0].task;
        targetList = matchingTasks[0].listId;
      } else if (matchingTasks.length > 1) {
        // Multiple matches - ask for clarification
        message = `📋 I found **${matchingTasks.length} matching tasks**. Which one did you mean?\n\n`;
        matchingTasks.forEach((item: any, i: number) => {
          message += `${i + 1}. **${item.task.title}**`;
          if (item.task.due) {
            const dueDate = new Date(item.task.due).toLocaleDateString('en-IN', { 
              month: 'short', 
              day: 'numeric' 
            });
            message += ` (due ${dueDate})`;
          }
          message += `\n   List: ${item.listName}\n\n`;
        });
        message += `Please specify which task to update more clearly.`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!targetTask || !targetList) {
        message = `❌ I couldn't find a task matching "${taskTitle}". \n\nTry:\n• "Show my tasks" to see what's on your list\n• Being more specific about the task name`;
      } else {
        // Update task
        const updateBody: any = {};
        if (newTitle) updateBody.title = newTitle;
        if (newNotes) updateBody.notes = newNotes;
        if (newDue) updateBody.due = newDue;

        const updateResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${targetList}/tasks/${targetTask.id}`,
          {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateBody),
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to update task');
        }

        message = `✅ Task updated: "${newTitle || targetTask.title}"`;
      }

    } else if (action === 'delete') {
      const { taskTitle } = intent.entities;
      
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

      // Search for the task across all lists with intelligent matching
      let targetTask: any = null;
      let targetList: string = '';
      const matchingTasks: any[] = [];
      
      console.log(`[${traceId}] Searching for task to delete: "${taskTitle}"`);

      for (const list of lists) {
        const tasksResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        const tasksData = await tasksResponse.json();
        const tasks = (tasksData.items || []).filter((t: any) => t.status !== 'completed');
        
        // Find all fuzzy matches
        const matches = tasks.filter((t: any) => {
          const taskLower = t.title.toLowerCase();
          const searchLower = taskTitle.toLowerCase();
          return taskLower.includes(searchLower) || searchLower.includes(taskLower);
        });
        
        matches.forEach((match: any) => {
          matchingTasks.push({ task: match, listId: list.id, listName: list.title });
        });
      }
      
      console.log(`[${traceId}] Found ${matchingTasks.length} matching tasks`);
      
      if (matchingTasks.length === 1) {
        targetTask = matchingTasks[0].task;
        targetList = matchingTasks[0].listId;
      } else if (matchingTasks.length > 1) {
        // Multiple matches - ask for clarification
        message = `📋 I found **${matchingTasks.length} matching tasks**. Which one did you want to delete?\n\n`;
        matchingTasks.forEach((item: any, i: number) => {
          message += `${i + 1}. **${item.task.title}**`;
          if (item.task.due) {
            const dueDate = new Date(item.task.due).toLocaleDateString('en-IN', { 
              month: 'short', 
              day: 'numeric' 
            });
            message += ` (due ${dueDate})`;
          }
          message += `\n   List: ${item.listName}\n\n`;
        });
        message += `Please reply with the exact task name to confirm which one to delete.`;
        
        return new Response(JSON.stringify({ message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!targetTask || !targetList) {
        message = `❌ I couldn't find a task matching "${taskTitle}". \n\nTry:\n• "Show my tasks" to see what's on your list\n• Being more specific about the task name`;
      } else {
        // Delete task
        const deleteResponse = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${targetList}/tasks/${targetTask.id}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (!deleteResponse.ok) {
          throw new Error('Failed to delete task');
        }

        message = `🗑️ Task deleted: "${targetTask.title}"`;
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