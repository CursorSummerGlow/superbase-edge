import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);
const queueName = 'generate-queue';
async function processMessage(queueMsg) {
  console.log("processing msg", queueMsg);
  // get photo_id from queue message
  const { photo_id } = queueMsg.message;
  console.log("photo_id", photo_id);
  // get photo_id details from DB
  const { data, error } = await supabase.from("photos").select('*').eq('id', photo_id).single();
  console.log("photo_id data DB", data, error);
  // throw error upwards if error
  if (error) {
    error.photo_id = photo_id;
    console.error("photo_id data DB error", error);
    throw error;
  }
  // archive the queue message
  const { del_data, del_error } = await supabase.schema('pgmq').rpc('archive', {
    queue_name: queueName,
    msg_id: queueMsg.msg_id
  });
  console.log("del_data", del_data, del_error);
}
async function processMessagesConcurrently(msgs) {
  const results = await Promise.allSettled(msgs.map((msg)=>processMessage(msg)));
  const failedMsgs = results.map((result, index)=>{
    if (result.status === 'rejected') {
      return {
        queueMsg: msgs[index],
        processingError: result.reason,
        at: new Date().toISOString()
      };
    }
    return null;
  }).filter((x)=>x !== null);
  // Optionally log them
  failedMsgs.forEach((f)=>console.error('processMessage failed for msg:', f.queueMsg, 'error:', f.processingError));
  return {
    failedMsgs
  };
}
async function task(queue_msgs) {
  console.log("running from task");
  await new Promise((f)=>setTimeout(f, 8000));
  const { failedMsgs } = await processMessagesConcurrently(queue_msgs);
  console.log("failedMsgs", failedMsgs.toString());
  console.log("finish task");
}
Deno.serve(async (req)=>{
  const { data, error } = await supabase.schema('pgmq').rpc('read', {
    queue_name: queueName,
    vt: 5,
    qty: 2
  });
  const msgs = data;
  console.log("msgs", msgs);
  EdgeRuntime.waitUntil(task(msgs));
  // const result = await supabase.schema('pgmq').rpc('pop', {
  //   queue_name: queueName
  // });
  // console.log("HELLOOOO?????", queueName, result);
  // Poll from the queue
  //
  // const failedMsgs = [];
  // for (const msg of msgs){
  //   try {
  //     await processMessage(msg);
  //   } catch (err) {
  //     failedMsgs.push({
  //       queueMg: msg,
  //       processingError: err,
  //       at: new Date().toISOString()
  //     });
  //     console.error('processMessage failed for msg:', msg, 'error:', err);
  //   }
  // }
  // Return if no msg in queue
  // if (!msgs || msgs.length === 0) {
  //   console.log('No messages in workflow_messages queue');
  //   return new Response(JSON.stringify({
  //     message: 'No messages in queue'
  //   }), {
  //     status: 200,
  //     headers: {
  //       'Content-Type': 'application/json'
  //     }
  //   });
  // }
  // for (const message of messages){
  //   try {
  //     await processMessage(message);
  //   } catch (error) {
  //     console.error(`Error processing message ${message.msg_id}:`, error);
  //   }
  // }
  // const { data: messages, error } = await supabase.schema('pgmq').rpc('read', {
  //   queue_name: queueName,
  //   sleep_seconds: 0,
  //   n: 5
  // });
  // if (error) {
  //   console.error(`Error reading from ${queueName} queue:`, error);
  //   return new Response(JSON.stringify({
  //     error: error.message
  //   }), {
  //     status: 500,
  //     headers: {
  //       'Content-Type': 'application/json'
  //     }
  //   });
  // }
  // if (!messages || messages.length === 0) {
  //   console.log('No messages in workflow_messages queue');
  //   return new Response(JSON.stringify({
  //     message: 'No messages in queue'
  //   }), {
  //     status: 200,
  //     headers: {
  //       'Content-Type': 'application/json'
  //     }
  //   });
  // }
  // console.log(`Found ${messages.length} messages to process`);
  // // Process each message that was read off the queue
  // for (const message of messages){
  //   try {
  //     await processMessage(message);
  //   } catch (error) {
  //     console.error(`Error processing message ${message.msg_id}:`, error);
  //   }
  // }
  // Return immediately while background processing continues
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
