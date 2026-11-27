import {validTime} from './journey-kml.mjs';

const dateError='Enter a valid year and month, with an optional day.';
export function dateLabel(value){return String(value||'').split('T')[0];}

export function calendarDate(month,day=''){
  month=month.trim();
  const entered=month.match(/^(0[1-9]|1[0-2])-(\d{4})$/);
  if(entered)month=entered[2]+'-'+entered[1];
  if(!month){
    if(day)throw new Error('Choose a year and month before adding a day.');
    return '';
  }
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1)throw new Error(dateError);
  if(day&&!/^\d{1,2}$/.test(day))throw new Error(dateError);
  const value=month+(day?'-'+day.padStart(2,'0'):'');
  if(!validTime(value))throw new Error(dateError);
  return value;
}

export function readDateFields(id){
  const month=document.getElementById(id),day=document.getElementById(id+'-day');
  if(month.validity.badInput||day.validity.badInput)throw new Error(dateError);
  const value=calendarDate(month.value,day.value);
  // Editing a name or note must not silently discard an imported timestamp.
  return month.dataset.originalDate&&dateLabel(month.dataset.originalDate)===value?month.dataset.originalDate:value;
}

export function writeDateFields(id,value=''){
  const month=document.getElementById(id),day=document.getElementById(id+'-day'),date=dateLabel(value);
  month.value=date?date.slice(5,7)+'-'+date.slice(0,4):'';day.value=date.length>=10?String(Number(date.slice(8,10))):'';
  month.dataset.originalDate=value||'';
}

export function setupDateFields(onChange=()=>{}){
  for(const month of document.querySelectorAll('[data-calendar-month]')){
    const day=document.getElementById(month.id+'-day');
    const update=event=>{
      delete month.dataset.originalDate;
      // Do not propagate an unfinished month or day while the user is typing.
      if(event.type==='input'&&!event.target.value)return;
      try{onChange(month.id,calendarDate(month.value,day.value));}catch{}
    };
    for(const input of [month,day]){
      input.addEventListener('input',update);
      input.addEventListener('change',update);
    }
    month.addEventListener('blur',()=>{
      try{const value=readDateFields(month.id);writeDateFields(month.id,value);}catch{}
    });
    month.form.addEventListener('reset',()=>{delete month.dataset.originalDate;});
  }
}
