import { Config } from '@remotion/cli/config';

// PNG frames keep the gradients and thin type clean before h264 encodes them.
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
