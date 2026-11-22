const jsonHeaders={"Content-Type":"application/json; charset=utf-8"};
function reply(statusCode,payload){return{statusCode,headers:jsonHeaders,body:JSON.stringify(payload)}}
exports.handler=async function(event){
 if(event.httpMethod!=="POST")return reply(405,{error:"Method Not Allowed"});
 let input;try{input=JSON.parse(event.body||"{}")}catch(_){return reply(400,{error:"Pyyntö ei sisältänyt kelvollista JSON-tietoa."})}
 const topicName=typeof input.topicName==='string'?input.topicName.trim().slice(0,120):'';if(!topicName)return reply(400,{error:"Aihe puuttuu."});
 const apiKey=process.env.OPENAI_API_KEY;if(!apiKey){console.error("OPENAI_API_KEY is not configured.");return reply(500,{error:"Kysymyspalvelua ei ole määritetty käyttöön."})}
 const difficultyDesc=typeof input.difficultyDesc==='string'?input.difficultyDesc.trim().slice(0,40):'helppo';
 const parsedStep=Number(input.currentStep);const currentStep=Number.isFinite(parsedStep)?Math.min(9,Math.max(0,Math.floor(parsedStep))):0;
 const recentAvoid=Array.isArray(input.recentAvoid)?input.recentAvoid.filter(item=>typeof item==='string').slice(-150).map(item=>item.slice(0,240)):[];
 const normalize=value=>value.toLocaleLowerCase('fi').replace(/[^a-z0-z0-9äöå ]/gi,'').replace(/\s+/g,' ').trim();
 const prompt=[
  'Luo yksi uusi, faktapohjainen ja yksiselitteinen suomenkielinen senioritietovisan kysymys.',
  `Aihe: ${topicName}`,
  `Vaikeustaso: ${difficultyDesc} (taso ${currentStep+1}/10).`,
  'Käytä selkeää yleiskieltä. Palauta JSON-objekti, jossa q on kysymys, a on oikea vastaus, w on täsmälleen kolme väärää vastausta ja hint on lyhyt suomenkielinen vihje.',
  'Varmista, ettei oikea vastaus esiinny väärien vastausten joukossa.',
  'Älä käytä kuviteltuja, vanhentuneita tai epävarmoja väitteitä.',
  recentAvoid.length?`ÄLÄ PALAUTA NÄITÄ AIEMMIN KÄYTETTYJÄ KYSEMYKSIÄ TAI SANALLISESTI SAMANLAISIA: ${JSON.stringify(recentAvoid)}`:''
 ].filter(Boolean).join('\n');
 try{
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:'Olet ystävällinen suomalaisen tietovisan juontaja. Palauta vain pyydetty JSON-objekti.'},{role:'user',content:prompt}],temperature:.7,response_format:{type:'json_object'}})});
  let data;try{data=await response.json()}catch(_){throw new Error('OpenAI returned invalid JSON')}
  if(!response.ok){console.error('OpenAI request failed:',response.status,data&&data.error&&data.error.message);return reply(502,{error:'Kysymyspalvelu ei ole juuri nyt käytettävissä.'})}
  const content=data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;if(typeof content!=='string'||!content.trim())throw new Error('No question content');
  const generated=JSON.parse(content);const question={q:typeof generated.q==='string'?generated.q.trim():'',a:typeof generated.a==='string'?generated.a.trim():'',w:Array.isArray(generated.w)?generated.w.filter(item=>typeof item==='string').map(item=>item.trim()).filter(Boolean).slice(0,3):[],hint:typeof generated.hint==='string'?generated.hint.trim():''};
  if(!question.q||!question.a||question.w.length!==3||question.w.some(answer=>normalize(answer)==normalize(question.a)))throw new Error('Invalid generated question');
  if(recentAvoid.some(oldQuestion=>normalize(oldQuestion)==normalize(question.q)))throw new Error('Repeated generated question');
  return reply(200,question);
 }catch(error){console.error('Question function failed:',error);return reply(502,{error:'Kysymyksen muodostaminen epäonnistui. Yritä hetken kuluttua uudelleen.'})}
};
