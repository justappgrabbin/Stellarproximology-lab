package org.stellar.livinglab;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public final class Store extends SQLiteOpenHelper {
    public static final String[] NAMES={"Movement","Evolution","Being","Design"};
    public final Context context;
    public final JSONObject profiles;
    public final GraphNet neural=new GraphNet();
    private static Store instance;
    public static synchronized Store get(Context context){if(instance==null)instance=new Store(context.getApplicationContext());return instance;}
    private Store(Context c){super(c,"living-lab.sqlite",null,1);context=c;
        JSONObject p;try{p=new JSONObject(read(c.getAssets().open("profiles.json")));}catch(Exception e){throw new IllegalStateException(e);}profiles=p;
        getWritableDatabase();loadWeights();seed();
    }
    public static String read(InputStream stream)throws IOException{try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
    public void onCreate(SQLiteDatabase db){
        db.execSQL("CREATE TABLE units(id TEXT PRIMARY KEY,dimension TEXT,bits TEXT,data TEXT)");
        db.execSQL("CREATE TABLE edges(a TEXT,b TEXT,weight REAL,origin TEXT,PRIMARY KEY(a,b))");
        db.execSQL("CREATE VIRTUAL TABLE evidence USING fts4(title,content,url)");
        db.execSQL("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,data TEXT,created INTEGER)");
        db.execSQL("CREATE TABLE jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,goal TEXT,status TEXT,created INTEGER)");
        db.execSQL("CREATE TABLE capabilities(id TEXT PRIMARY KEY,data TEXT,enabled INTEGER,created INTEGER)");
    }
    public void onUpgrade(SQLiteDatabase db,int old,int version){throw new IllegalStateException("Unsupported schema migration");}
    private void seed(){
        SQLiteDatabase db=getWritableDatabase();try(Cursor c=db.rawQuery("SELECT count(*) FROM units",null)){c.moveToFirst();if(c.getInt(0)>0)return;}
        db.beginTransaction();try{
            for(String dim:NAMES)for(int i=0;i<64;i++){
                String bits=String.format(java.util.Locale.ROOT,"%6s",Integer.toBinaryString(i)).replace(' ','0');String id=dim+":"+bits;
                JSONObject unit=new JSONObject().put("id",id).put("dimension",dim).put("bits",bits)
                    .put("heart",new JSONArray().put(bits.substring(0,2)).put(bits.substring(2,4)).put(bits.substring(4)))
                    .put("mind",new JSONArray().put(bits.substring(0,3)).put(bits.substring(3))).put("body",bits)
                    .put("tcs",JSONObject.NULL).put("perspective",profiles.getJSONObject("dimensions").getJSONObject(dim));
                db.execSQL("INSERT INTO units VALUES(?,?,?,?)",new Object[]{id,dim,bits,unit.toString()});
                for(String other:NAMES)if(!dim.equals(other))db.execSQL("INSERT OR IGNORE INTO edges VALUES(?,?,?,?)",new Object[]{id,other+":"+bits,.5,"shared-six-lines"});
                for(int bit=0;bit<6;bit++){String next=String.format(java.util.Locale.ROOT,"%6s",Integer.toBinaryString(i^(1<<bit))).replace(' ','0');db.execSQL("INSERT OR IGNORE INTO edges VALUES(?,?,?,?)",new Object[]{id,dim+":"+next,.25,"one-line-transition"});}
            }db.setTransactionSuccessful();
        }catch(JSONException e){throw new IllegalStateException(e);}finally{db.endTransaction();}
        event("bootstrap",new JSONObject(),"Created 256 binary units and their explicit relationships. No linguistic mappings invented.");
    }
    public synchronized void event(String kind,JSONObject data,String message){try{data.put("message",message);getWritableDatabase().execSQL("INSERT INTO events(kind,data,created) VALUES(?,?,?)",new Object[]{kind,data.toString(),System.currentTimeMillis()});}catch(JSONException e){throw new IllegalStateException(e);}}
    public synchronized void enqueue(String goal){if(goal==null||goal.trim().isEmpty()||goal.length()>500)return;getWritableDatabase().execSQL("INSERT INTO jobs(goal,status,created) VALUES(?,?,?)",new Object[]{goal,"queued",System.currentTimeMillis()});}
    public synchronized void observe(JSONObject observation){
        event("observation",observation,observation.optString("text","User interaction"));String id=observation.optString("unit","");
        try(Cursor c=getReadableDatabase().rawQuery("SELECT dimension,bits FROM units WHERE id=?",new String[]{id})){
            if(c.moveToFirst()){int d=java.util.Arrays.asList(NAMES).indexOf(c.getString(0));double[] x=GraphNet.features(observation.optString("text"));double[] y=GraphNet.unitFeatures(c.getString(1),d);neural.train(x,y,1);
                int neg=(Integer.parseInt(c.getString(1),2)+17)%64;String b=String.format(java.util.Locale.ROOT,"%6s",Integer.toBinaryString(neg)).replace(' ','0');neural.train(x,GraphNet.unitFeatures(b,(d+1)%4),0);
                getWritableDatabase().execSQL("INSERT OR REPLACE INTO edges VALUES(?,?,?,?)",new Object[]{"user",id,neural.score(x,y),"observed-interaction"});saveWeights();
            }
        }
        try(Cursor c=getReadableDatabase().rawQuery("SELECT data FROM capabilities WHERE enabled=1",null)){while(c.moveToNext())try{JSONObject cap=new JSONObject(c.getString(0));if(cap.optString("trigger").equals("user_observation")){String target=cap.getString("target");double delta=cap.getDouble("delta");getWritableDatabase().execSQL("INSERT OR IGNORE INTO edges VALUES('user',?,0.5,'verified-rule')",new Object[]{target});getWritableDatabase().execSQL("UPDATE edges SET weight=min(1,max(0,weight+?)) WHERE a='user' AND b=?",new Object[]{delta,target});}}catch(JSONException ignored){}}
    }
    public synchronized JSONArray retrieve(String query)throws JSONException{
        StringBuilder match=new StringBuilder();for(String word:query.toLowerCase(java.util.Locale.ROOT).split("[^\\p{L}\\p{N}]+")){if(word.length()>2){if(match.length()>0)match.append(" OR ");match.append('"').append(word).append('"');}}
        JSONArray result=new JSONArray();if(match.length()==0)return result;
        try(Cursor c=getReadableDatabase().rawQuery("SELECT rowid,title,content,url FROM evidence WHERE evidence MATCH ? LIMIT 20",new String[]{match.toString()})){
            java.util.ArrayList<JSONObject> docs=new java.util.ArrayList<>();double[] q=GraphNet.features(query);
            while(c.moveToNext())docs.add(new JSONObject().put("id","local:"+c.getLong(0)).put("title",c.getString(1)).put("text",c.getString(2)).put("url",c.getString(3)).put("score",neural.score(q,GraphNet.features(c.getString(2)))));
            docs.sort((a,b)->Double.compare(b.optDouble("score"),a.optDouble("score")));for(int i=0;i<Math.min(6,docs.size());i++)result.put(docs.get(i));
        }return result;
    }
    public synchronized void evidence(String title,String text,String url){if(text.length()>16000)text=text.substring(0,16000);getWritableDatabase().execSQL("DELETE FROM evidence WHERE title=? AND url=?",new Object[]{title,url});getWritableDatabase().execSQL("INSERT INTO evidence(title,content,url) VALUES(?,?,?)",new Object[]{title,text,url});}
    public synchronized boolean promote(JSONObject cap)throws JSONException{
        String target=cap.getString("target");double delta=cap.getDouble("delta");
        if(!cap.optString("trigger").equals("user_observation")||!Double.isFinite(delta)||Math.abs(delta)>.1||!cap.optString("name").matches("[A-Za-z0-9_-]{1,60}"))return false;
        try(Cursor c=getReadableDatabase().rawQuery("SELECT id FROM units WHERE id=?",new String[]{target})){if(!c.moveToFirst())return false;}
        String id=cap.getString("name");getWritableDatabase().execSQL("INSERT OR REPLACE INTO capabilities VALUES(?,?,1,?)",new Object[]{id,cap.toString(),System.currentTimeMillis()});return true;
    }
    public synchronized JSONObject localHypothesis(String dimension,String goal,JSONArray sources)throws JSONException{
        int d=java.util.Arrays.asList(NAMES).indexOf(dimension);double[] context=GraphNet.features(goal);String best="000000";double bestScore=-1;
        for(int i=0;i<64;i++){String bits=String.format(java.util.Locale.ROOT,"%6s",Integer.toBinaryString(i)).replace(' ','0');double score=neural.score(context,GraphNet.unitFeatures(bits,d));if(score>bestScore){bestScore=score;best=bits;}}
        JSONArray cited=new JSONArray().put("dimension-profiles");for(int i=0;i<sources.length();i++)if(sources.getJSONObject(i).optString("id").startsWith("local:")){cited.put(sources.getJSONObject(i).getString("id"));break;}
        return new JSONObject().put("name","local_"+dimension+"_"+Integer.toHexString(goal.hashCode())).put("trigger","user_observation").put("target",dimension+":"+best).put("delta",Math.min(.02,Math.max(-.02,(bestScore-.5)*.04)))
            .put("hypothesis","The local learned encoder predicts affinity "+bestScore+" between this context and "+dimension+":"+best+". This is a numerical hypothesis, not a linguistic interpretation.")
            .put("prediction","A user event will apply the bounded delta to this relationship without leaving 0..1.").put("source_ids",cited).put("model_mode","local-neural");
    }
    public synchronized JSONObject snapshot()throws JSONException{
        JSONObject out=new JSONObject();JSONArray units=new JSONArray(),caps=new JSONArray(),observations=new JSONArray(),journals=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT data FROM units ORDER BY rowid",null)){while(c.moveToNext())units.put(new JSONObject(c.getString(0)));}
        java.util.HashMap<String,Double> learned=new java.util.HashMap<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT b,weight FROM edges WHERE a='user'",null)){while(c.moveToNext())learned.put(c.getString(0),c.getDouble(1));}for(int i=0;i<units.length();i++){JSONObject unit=units.getJSONObject(i);unit.put("relationship_strength",learned.getOrDefault(unit.getString("id"),.5));}
        try(Cursor c=getReadableDatabase().rawQuery("SELECT data FROM capabilities WHERE enabled=1",null)){while(c.moveToNext())caps.put(new JSONObject(c.getString(0)));}
        try(Cursor c=getReadableDatabase().rawQuery("SELECT kind,data,created FROM events ORDER BY id DESC LIMIT 40",null)){while(c.moveToNext()){JSONObject data=new JSONObject(c.getString(1));if(c.getString(0).equals("observation"))observations.put(data);else if(data.has("goal"))journals.put(data);}}
        // UI journals are chronological; the view renders the newest last.
        JSONArray chronological=new JSONArray();for(int i=journals.length()-1;i>=0;i--)chronological.put(journals.get(i));
        try(Cursor c=getReadableDatabase().rawQuery("SELECT count(*) FROM edges",null)){c.moveToFirst();out.put("relationships",c.getInt(0));}
        return out.put("units",units).put("capabilities",caps).put("observations",observations).put("journals",chronological)
            .put("running",context.getSharedPreferences("runtime",0).getBoolean("running",false));
    }
    private void loadWeights(){File f=new File(context.getFilesDir(),"relationship-network.json");if(!f.exists())return;try{JSONArray rows=new JSONArray(read(new FileInputStream(f)));for(int i=0;i<GraphNet.D;i++)for(int j=0;j<GraphNet.D;j++)neural.weights[i][j]=rows.getJSONArray(i).getDouble(j);}catch(Exception e){event("network-load-error",new JSONObject(),e.getClass().getSimpleName());}}
    public synchronized JSONObject exportMemory()throws JSONException{
        JSONObject all=snapshot();JSONArray evidence=new JSONArray(),events=new JSONArray(),edges=new JSONArray(),weights=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT title,content,url FROM evidence",null)){while(c.moveToNext())evidence.put(new JSONObject().put("title",c.getString(0)).put("text",c.getString(1)).put("url",c.getString(2)));}
        try(Cursor c=getReadableDatabase().rawQuery("SELECT kind,data,created FROM events ORDER BY id",null)){while(c.moveToNext())events.put(new JSONObject().put("kind",c.getString(0)).put("data",new JSONObject(c.getString(1))).put("created",c.getLong(2)));}
        try(Cursor c=getReadableDatabase().rawQuery("SELECT a,b,weight,origin FROM edges",null)){while(c.moveToNext())edges.put(new JSONObject().put("from",c.getString(0)).put("to",c.getString(1)).put("weight",c.getDouble(2)).put("origin",c.getString(3)));}
        for(double[] row:neural.weights){JSONArray values=new JSONArray();for(double v:row)values.put(v);weights.put(values);}
        return all.put("evidence",evidence).put("events",events).put("edges",edges).put("neural_weights",weights).put("export_version",1);
    }
    public synchronized void saveWeights(){try{JSONArray rows=new JSONArray();for(double[] row:neural.weights){JSONArray a=new JSONArray();for(double v:row)a.put(v);rows.put(a);}File temp=new File(context.getFilesDir(),"relationship-network.tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(rows.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}if(!temp.renameTo(new File(context.getFilesDir(),"relationship-network.json")))throw new IOException("Weight persistence failed");}catch(Exception e){event("network-save-error",new JSONObject(),e.getClass().getSimpleName());}}
}
