import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ios=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(ios);
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=vm.createContext({window:{}});
for (const file of ['data/catalog.js','data/photos.js','js/icons.js']) vm.runInContext(read(file),source);
const {CATALOG,PHOTOS}=source.window;
const assets=path.join(ios,'App/Assets.xcassets');
const resource=path.join(ios,'App/Resources');
const items=CATALOG.items.filter(r=>r[7]>0).map(([id,name,price,cat,sub,img,kg,stock,offers,large,old])=>{
 const photo=img || offers.map(([shop,sku])=>PHOTOS[shop+':'+sku]).find(Boolean) || '';
 return {id,name,price,cat,sub:CATALOG.cats.find(c=>c.id===cat).subs[sub] || '',photo,large:large||photo,kg:!!kg,stock,offers:offers.map(([store,,price])=>({store,price})),old:old||0};
}).filter(item=>item.photo);
fs.writeFileSync(path.join(resource,'market.json'),JSON.stringify({items,categories:CATALOG.cats,stores:CATALOG.meta.stores.map(s=>s.name)}));
function asset(name,file,data,template=false){
 const dir=path.join(assets,name+'.imageset'); fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,file),data);
 fs.writeFileSync(path.join(dir,'Contents.json'),JSON.stringify({images:[{idiom:'universal',filename:file}],info:{version:1,author:'xcode'},properties:template?{'template-rendering-intent':'template','preserves-vector-representation':true}:{}}));
}
for (const [name,paths] of Object.entries(vm.runInContext('PHI',source))) asset('icon-'+name,'shape.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'+paths+'</svg>',true);
for(const name of fs.readdirSync(path.join(root,'assets/icons'))) fs.copyFileSync(path.join(root,'assets/icons',name),path.join(resource,'category-'+name));
for(const name of ['musafir-clear','vkusdom-mark']) asset(name,'mark.png',fs.readFileSync(path.join(root,'assets/brand',name+'.png')));
