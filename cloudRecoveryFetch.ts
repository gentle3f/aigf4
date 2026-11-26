// Preview recovery uses existing Supabase Auth, but no database or storage writes.
export function createCloudRecoveryFetch(base:string,fetchImpl:typeof fetch=fetch):typeof fetch{
 const origin=new URL(base).origin;
 return async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const read=method==='GET'||method==='HEAD';
  const path=url.pathname;
  const rest=read&&/^\/rest\/v1\/wetapp_(state|messages|media)$/.test(path);
  const storage=read&&path.startsWith('/storage/v1/object/')&&!path.includes('/sign/')&&!path.includes('/public/');
  const auth=method==='POST'&&path==='/auth/v1/token'&&['password','refresh_token'].includes(url.searchParams.get('grant_type')||'');
  if(url.origin!==origin||url.username||url.password||!(rest||storage||auth))throw Error('CLOUD_RECOVERY_READ_ONLY');
  return fetchImpl(input,{...init,redirect:'error'});
 };
}
