// Gives the Gradle daemon enough heap/metaspace for Skia + Reanimated native builds.
// Without it the daemon runs out of metaspace and restarts, slowing every build.
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'org.gradle.jvmargs'));
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
};
