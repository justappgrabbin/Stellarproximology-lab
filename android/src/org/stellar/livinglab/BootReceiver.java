package org.stellar.livinglab;
import android.content.*;
public final class BootReceiver extends BroadcastReceiver {
    public void onReceive(Context context,Intent intent){if(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())&&context.getSharedPreferences("runtime",0).getBoolean("running",false))context.startForegroundService(new Intent(context,AutonomyService.class));}
}
