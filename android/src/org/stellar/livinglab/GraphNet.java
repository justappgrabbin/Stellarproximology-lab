package org.stellar.livinglab;

import java.util.Random;

/** Small trainable shared encoder for relationship prediction. Not a pretrained LLM. */
public final class GraphNet {
    public static final int D = 12;
    public final double[][] weights = new double[D][D];

    public GraphNet() {
        Random random = new Random(6431);
        for (int i=0;i<D;i++) for(int j=0;j<D;j++) weights[i][j]=(i==j?.7:0)+random.nextGaussian()*.025;
    }
    public static double[] features(String text) {
        double[] value=new double[D];
        for(String word:text.toLowerCase(java.util.Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if(word.isEmpty())continue;
            int hash=word.hashCode();value[Math.floorMod(hash,D)]+=((hash&1)==0?1:-1);
        }
        double norm=0;for(double v:value)norm+=v*v;
        if(norm>0)for(int i=0;i<D;i++)value[i]/=Math.sqrt(norm);
        return value;
    }
    public static double[] unitFeatures(String bits,int dimension) {
        double[] value=new double[D];
        for(int i=0;i<6;i++)value[i]=bits.charAt(i)=='1'?.4:-.4;
        value[6+dimension]=1;return value;
    }
    public double[] encode(double[] features) {
        double[] value=new double[D];
        for(int i=0;i<D;i++){for(int j=0;j<D;j++)value[i]+=weights[i][j]*features[j];value[i]=Math.tanh(value[i]);}
        return value;
    }
    public double score(double[] a,double[] b) {
        double[] x=encode(a),y=encode(b);double dot=0;
        for(int i=0;i<D;i++)dot+=x[i]*y[i];
        return 1/(1+Math.exp(-dot));
    }
    public double train(double[] a,double[] b,double target) {
        double[] x=encode(a),y=encode(b);double dot=0;for(int i=0;i<D;i++)dot+=x[i]*y[i];
        double prediction=1/(1+Math.exp(-dot)),error=prediction-target;
        for(int i=0;i<D;i++)for(int j=0;j<D;j++){
            double gradient=error*((1-x[i]*x[i])*y[i]*a[j]+(1-y[i]*y[i])*x[i]*b[j]);
            weights[i][j]-=.025*Math.max(-2,Math.min(2,gradient));
        }
        return -(target*Math.log(Math.max(1e-9,prediction))+(1-target)*Math.log(Math.max(1e-9,1-prediction)));
    }
}
