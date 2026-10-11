package org.stellar.livinglab;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.text.InputType;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private Store store;private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private String pendingExport;
    public void onCreate(Bundle state){super.onCreate(state);store=Store.get(this);
        if(Build.VERSION.SDK_INT>=33)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},5);
        WebView web=new WebView(this);web.setBackgroundColor(0xff0b1422);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new Bridge(),"StellarNative");
        web.setWebViewClient(new WebViewClient(){
            public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if("appassets.androidplatform.net".equals(uri.getHost()))return false;if(request.isForMainFrame()&&"https".equals(uri.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,uri));return true;}
            public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                String path=request.getUrl().getPath();if(!"appassets.androidplatform.net".equals(request.getUrl().getHost())||path==null)return denied();
                if(path.equals("/"))path="/index.html";String file=path.substring(1);
                if(!file.matches("index\\.html|app\\.js|engine\\.js|style\\.css|profiles\\.json|manifest\\.webmanifest|icon\\.svg"))return denied();
                String mime=file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":file.endsWith(".html")?"text/html":file.endsWith(".svg")?"image/svg+xml":"application/json";
                try{return new WebResourceResponse(mime,"UTF-8",getAssets().open(file));}catch(IOException e){return denied();}
            }
            private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
        });setContentView(web);web.loadUrl("https://appassets.androidplatform.net/index.html");
    }
    public final class Bridge {
        @JavascriptInterface public String snapshot(){try{return store.snapshot().toString();}catch(Exception e){return "{\"error\":\"Local state unavailable\"}";}}
        @JavascriptInterface public void submit(String goal){executor.execute(()->store.enqueue(goal));}
        @JavascriptInterface public void observe(String data){if(data==null||data.length()>4000)return;executor.execute(()->{try{store.observe(new JSONObject(data));}catch(Exception e){store.event("observation-error",new JSONObject(),e.getClass().getSimpleName());}});}
        @JavascriptInterface public void start(){runOnUiThread(()->startForegroundService(new Intent(MainActivity.this,AutonomyService.class)));}
        @JavascriptInterface public void stop(){getSharedPreferences("runtime",0).edit().putBoolean("running",false).putBoolean("autonomous",false).apply();runOnUiThread(()->stopService(new Intent(MainActivity.this,AutonomyService.class)));}
        @JavascriptInterface public void setAutonomy(boolean enabled){getSharedPreferences("runtime",0).edit().putBoolean("autonomous",enabled).apply();if(enabled)start();}
        @JavascriptInterface public void settings(){runOnUiThread(MainActivity.this::configure);}
        @JavascriptInterface public void demo(){executor.execute(()->{try{
            JSONObject journal=new JSONObject().put("goal","Offline capability-growth demonstration").put("mode","offline-demo").put("status","verified");JSONObject perspectives=new JSONObject();
            for(String dimension:Store.NAMES){JSONObject rule=new JSONObject().put("name","demo_"+dimension).put("trigger","user_observation").put("target",dimension+":010101").put("delta",.01).put("hypothesis","A bounded rule can strengthen a known relationship on user interaction.").put("prediction","The target edge stays within 0..1 and increases by at most 0.01.");if(!store.promote(rule))throw new IllegalStateException("Native contract rejected demo");perspectives.put(dimension,new JSONObject().put("status","verified").put("hypothesis",new JSONObject().put("hypothesis",rule.getString("hypothesis"))).put("verification",new JSONObject().put("ok",true)));}
            journal.put("rounds",new JSONArray().put(new JSONObject().put("perspectives",perspectives)));store.event("offline-demo",journal,"Four native declarative rules were validated and stored; no live LLM was called.");
        }catch(Exception e){store.event("demo-error",new JSONObject(),e.getMessage());}});}
        @JavascriptInterface public void exportMemory(){executor.execute(()->{try{pendingExport=store.exportMemory().toString(2);runOnUiThread(()->{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"stellar-memory.json");startActivityForResult(intent,7);});}catch(Exception e){toast("Export failed");}});}
    }
    private void toast(String message){runOnUiThread(()->Toast.makeText(this,message,Toast.LENGTH_LONG).show());}
    private void configure(){
        JSONObject saved;try{saved=new Vault(this).load();}catch(Exception e){toast("Could not unlock the local credential vault");return;}
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(28,12,28,20);ScrollView scroll=new ScrollView(this);scroll.addView(layout);
        java.util.LinkedHashMap<String,EditText> fields=new java.util.LinkedHashMap<>();
        String[][] entries={{"githubRepo","GitHub owner/repository"},{"githubToken","GitHub access token"},{"mcpUrl","MCP HTTPS endpoint"},{"mcpToken","MCP access token"},{"mcpResearchTool","Allowed autonomous MCP research tool"},{"mcpArguments","MCP arguments JSON; $goal substitutes the task"},{"hfToken","Optional Hugging Face inference token"},{"modelMovement","Movement model ID"},{"modelEvolution","Evolution model ID"},{"modelBeing","Being model ID"},{"modelDesign","Design model ID"}};
        for(String[] entry:entries){TextView label=new TextView(this);label.setText(entry[1]);layout.addView(label);EditText input=new EditText(this);input.setText(saved.optString(entry[0]));input.setSingleLine(true);if(entry[0].toLowerCase(java.util.Locale.ROOT).contains("token"))input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);layout.addView(input);fields.put(entry[0],input);}
        java.util.LinkedHashMap<String,CheckBox> toggles=new java.util.LinkedHashMap<>();for(String[] entry:new String[][]{{"webResearch","Allow autonomous public web research"},{"githubResearch","Allow autonomous GitHub README research"},{"mcpResearch","Allow the configured MCP research tool"}}){CheckBox box=new CheckBox(this);box.setText(entry[1]);box.setChecked(saved.optBoolean(entry[0],false));layout.addView(box);toggles.put(entry[0],box);}
        Button publish=new Button(this);publish.setText("Publish capability catalog to a new GitHub branch");layout.addView(publish);publish.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Publish the current capabilities?").setMessage("This writes the binary catalog and verified rules to a new branch in your configured repository. Private observations and credentials are excluded. Save your connection settings first.").setPositiveButton("Publish",(dialog,which)->executor.execute(()->{try{String url=new Hands(this).publish(store.snapshot());toast("Published capabilities to "+url);}catch(Exception e){toast("GitHub hand: "+e.getMessage());}})).setNegativeButton("Cancel",null).show());
        Button tools=new Button(this);tools.setText("Inspect MCP tools");layout.addView(tools);tools.setOnClickListener(v->executor.execute(()->{try{String response=new Hands(this).mcp("",new JSONObject()).toString(2);runOnUiThread(()->new AlertDialog.Builder(this).setTitle("MCP tool inventory").setMessage(response.substring(0,Math.min(12000,response.length()))).setPositiveButton("Close",null).show());}catch(Exception e){toast("MCP hand: "+e.getMessage());}}));
        new AlertDialog.Builder(this).setTitle("On-device core & external hands").setView(scroll).setPositiveButton("Save locally",(dialog,which)->{
            try{JSONObject config=new JSONObject();for(java.util.Map.Entry<String,EditText> field:fields.entrySet())config.put(field.getKey(),field.getValue().getText().toString().trim());for(java.util.Map.Entry<String,CheckBox> toggle:toggles.entrySet())config.put(toggle.getKey(),toggle.getValue().isChecked());
                String url=config.optString("mcpUrl");if(!url.isEmpty()&&!url.startsWith("https://"))throw new IllegalArgumentException("MCP endpoint must use HTTPS");String args=config.optString("mcpArguments");if(!args.isEmpty())new JSONObject(args);new Vault(this).save(config);toast("Saved in the phone's encrypted vault");
            }catch(Exception e){toast("Settings were not saved: "+e.getMessage());}
        }).setNegativeButton("Cancel",null).show();
    }
    protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==7&&result==RESULT_OK&&data!=null&&pendingExport!=null){Uri uri=data.getData();String export=pendingExport;pendingExport=null;executor.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri)){if(out==null)throw new IOException("Destination unavailable");out.write(export.getBytes("UTF-8"));toast("Local memory exported");}catch(Exception e){toast("Export failed");}});}}
    protected void onDestroy(){executor.shutdown();super.onDestroy();}
}
