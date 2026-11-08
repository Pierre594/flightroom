import {normalizeProjectName} from './project-names.js';

async function checked(response) {
  if(!(response.headers.get('content-type')??'').includes('application/json'))throw new Error('Local project storage is unavailable. Start the app with npm run dev or npm run preview.');
  if(!response.ok){const body=await response.json();throw new Error(body.error||'Project storage failed.');}
  return response;
}
export async function listProjects(type) {
  const {projects}=await (await checked(await fetch('/__flightroom_projects/list'))).json();
  return projects.filter(project=>project.type===type||project.type==='unknown');
}
export async function saveProject(name,project) {
  const normalized=normalizeProjectName(name),response=await checked(await fetch(`/__flightroom_projects/save?name=${encodeURIComponent(normalized)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...project,projectName:normalized})}));
  const result=await response.json();window.dispatchEvent(new Event('flightroom-projects-changed'));return result.name;
}
export async function openProject(name) {
  const normalized=normalizeProjectName(name),response=await checked(await fetch(`/__flightroom_projects/open?name=${encodeURIComponent(normalized)}`));
  return new File([await response.blob()],`${normalized}.json`,{type:'application/json'});
}
export function projectNameFromFile(file,storedName) {
  if(typeof storedName==='string'&&storedName.trim())return storedName;
  return file.name.replace(/\.json$/i,'') || 'Untitled';
}

export function setupProjectLibrary({select,button,type,onOpen}) {
  let locked=false,request=0;
  const updateButton=()=>{button.disabled=locked||!select.value;select.disabled=locked;};
  async function refresh(){
    const current=select.value,token=++request;
    try{const projects=await listProjects(type);if(token!==request)return;
      const options=[...select.options];if(options.length===projects.length+1&&options[0]?.value===''&&options.slice(1).every((option,i)=>option.value===projects[i].name&&option.text===(projects[i].type==='unknown'?`${projects[i].name} (unclassified)`:projects[i].name))){updateButton();return;}
      select.replaceChildren(new Option('Select a saved project…',''));
      for(const project of projects)select.add(new Option(project.type==='unknown'?`${project.name} (unclassified)`:project.name,project.name));
      if([...select.options].some(option=>option.value===current))select.value=current;updateButton();
    }catch{if(token!==request)return;select.replaceChildren(new Option('Local projects unavailable',''));updateButton();}
  }
  select.addEventListener('change',updateButton);select.addEventListener('focus',refresh);
  button.addEventListener('click',()=>{if(!locked&&select.value)onOpen(select.value);});
  window.addEventListener('flightroom-projects-changed',refresh);refresh();
  return {refresh,setLocked(value){locked=value;updateButton();}};
}
