package org.stellar.livinglab;

import android.app.*;
import android.content.*;
import android.database.Cursor;
import android.os.*;
import org.json.*;
import java.util.concurrent.*;

public final class AutonomyService extends Service {
    private final ScheduledExecutorService executor=Executors.newSingleThreadScheduledExecutor();
    private Store store;private Hands hands;
    public void onCreate(){super.onCreate();store=Store.get(this);hands=new Hands(this);
        NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("local-autonomy","Local autonomy",NotificationManager.IMPORTANCE_LOW));
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(this,"local-autonomy").setContentTitle("Stellar local core is active").setContentText("Memory, relationship learning and queued research live on this phone.").setSmallIcon(android.R.drawable.ic_menu_compass).setContentIntent(open).setOngoing(true).build();
        if(Build.VERSION.SDK_INT>=34)startForeground(17,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);else startForeground(17,notification);
        store.getWritableDatabase().execSQL("UPDATE jobs SET status='queued' WHERE status='running'");
        executor.scheduleWithFixedDelay(()->{try{tick();}catch(Exception e){store.event("service-error",new JSONObject(),e.getClass().getSimpleName()+": "+e.getMessage());}},1,15,TimeUnit.SECONDS);
    }
    public int onStartCommand(Intent intent,int flags,int id){getSharedPreferences("runtime",0).edit().putBoolean("running",true).apply();return START_STICKY;}
    private void tick()throws Exception{
        long id;String goal;
        try(Cursor c=store.getReadableDatabase().rawQuery("SELECT id,goal FROM jobs WHERE status='queued' ORDER BY id LIMIT 1",null)){
            if(!c.moveToFirst()){
                android.content.SharedPreferences prefs=getSharedPreferences("runtime",0);long last=prefs.getLong("last_autonomy",0);
                if(prefs.getBoolean("autonomous",false)&&System.currentTimeMillis()-last>30*60*1000L){store.enqueue("Investigate relationships between user observations and the four dimension perspectives; retain unknowns.");prefs.edit().putLong("last_autonomy",System.currentTimeMillis()).apply();}
                return;
            }id=c.getLong(0);goal=c.getString(1);
        }
        PowerManager.WakeLock lock=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"stellar:research-job");lock.acquire(180000);
        store.getWritableDatabase().execSQL("UPDATE jobs SET status='running' WHERE id=?",new Object[]{id});
        JSONObject journal=new JSONObject().put("goal",goal).put("mode","on-device-core").put("status","researching");JSONArray sources=new JSONArray();
        try{
            JSONObject settings=new Vault(this).load();
            sources.put(new JSONObject().put("id","dimension-profiles").put("title","Your source perspectives").put("text",store.profiles.toString()));
            JSONArray rag=store.retrieve(goal);for(int i=0;i<rag.length();i++)sources.put(rag.get(i));
            if(settings.optBoolean("webResearch",false))try{JSONArray web=hands.research(goal);for(int i=0;i<web.length();i++){JSONObject s=web.getJSONObject(i);sources.put(s);store.evidence(s.getString("title"),s.getString("text"),s.getString("url"));}}catch(Exception e){journal.put("web_error",e.getMessage());}
            if(settings.optBoolean("githubResearch",false))try{JSONObject source=hands.githubReadme();sources.put(source);store.evidence(source.getString("title"),source.getString("text"),source.getString("url"));}catch(Exception e){journal.put("github_error",e.getMessage());}
            if(settings.optBoolean("mcpResearch",false))try{JSONObject source=hands.mcpResearch(goal);sources.put(source);store.evidence(source.getString("title"),source.getString("text"),source.getString("url"));}catch(Exception e){journal.put("mcp_error",e.getMessage());}
            // Bound total prompt evidence while retaining source IDs and links.
            for(int i=0;i<sources.length();i++){JSONObject source=sources.getJSONObject(i);String text=source.optString("text");if(text.length()>4000)source.put("text",text.substring(0,4000));}
            journal.put("sources",sources);JSONArray rounds=new JSONArray();JSONObject round=new JSONObject().put("attempt",1),perspectives=new JSONObject();round.put("perspectives",perspectives);rounds.put(round);journal.put("rounds",rounds);int passed=0;
            for(String dimension:Store.NAMES){JSONObject slot=new JSONObject();perspectives.put(dimension,slot);
                try{
                    JSONObject profile=store.profiles.getJSONObject("dimensions").getJSONObject(dimension);
                    boolean live=!settings.optString("hfToken").isEmpty()&&!settings.optString("model"+dimension).isEmpty();
                    JSONObject cap=live?hands.hypothesize(dimension,goal,sources,profile):store.localHypothesis(dimension,goal,sources);slot.put("model_mode",live?"hf-inference":"local-neural");JSONArray ids=cap.getJSONArray("source_ids");boolean citations=ids.length()>0;
                    for(int j=0;j<ids.length();j++){boolean found=false;for(int k=0;k<sources.length();k++)if(ids.getString(j).equals(sources.getJSONObject(k).optString("id")))found=true;citations&=found;}
                    if(!citations||!cap.getString("target").startsWith(dimension+":"))throw new IllegalArgumentException("Unsupported citation or perspective identity");
                    // Native core validates the declarative program and its bounded effect.
                    double delta=cap.getDouble("delta");double before=.5,after=Math.min(1,Math.max(0,before+delta));if(!Double.isFinite(after)||Math.abs(after-before)>.100001)throw new IllegalArgumentException("Rule effect failed its contract");
                    if(!store.promote(cap))throw new IllegalArgumentException("Capability failed native validation");
                    slot.put("status","verified").put("capability",cap).put("hypothesis",new JSONObject().put("hypothesis",cap.optString("hypothesis")).put("prediction",cap.optString("prediction"))).put("verification",new JSONObject().put("ok",true).put("before",before).put("after",after))
                        .put("reflection","Structural rule test passed. Linguistic meaning and the hypothesis remain unverified.");passed++;
                }catch(Exception e){slot.put("status","blocked").put("error",e.getMessage());}
            }
            journal.put("status",passed==4?"verified":passed>0?"partially-verified":"blocked");store.saveWeights();
            store.getWritableDatabase().execSQL("UPDATE jobs SET status=? WHERE id=?",new Object[]{journal.getString("status"),id});
        }catch(Exception e){journal.put("status","blocked").put("error",e.getMessage());store.getWritableDatabase().execSQL("UPDATE jobs SET status='blocked' WHERE id=?",new Object[]{id});}
        finally{store.event("research-cycle",journal,"Research cycle completed with measured status.");if(lock.isHeld())lock.release();}
    }
    public IBinder onBind(Intent intent){return null;}
    public void onDestroy(){executor.shutdownNow();super.onDestroy();}
}
