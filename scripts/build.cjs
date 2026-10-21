const esbuild=require('esbuild');
esbuild.buildSync({entryPoints:['src/auth-client.ts'],outfile:'dist/cloud-client.js',bundle:true,format:'iife',platform:'browser',target:['es2022'],minify:true,legalComments:'eof'});
console.log('Cliente de autenticação compilado.');
