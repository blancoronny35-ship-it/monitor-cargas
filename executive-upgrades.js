(function(){
  function waitForReady(){
    if(!window.render || !document.querySelector('.stabs') || !document.getElementById('tab-dash')){
      setTimeout(waitForReady, 120);
      return;
    }
    if(window.__midasExecutiveUpgradesApplied) return;
    window.__midasExecutiveUpgradesApplied = true;
    applyStyles();
    injectInsightsTab();
    installHelpers();
    patchRender();
    if(typeof render === 'function') render();
  }

  function applyStyles(){
    var css = `
      .exec-card,.project-card,.ins-card{background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:10px 12px;box-shadow:0 1px 4px rgba(32,122,255,.06);margin-bottom:8px;}
      .exec-card{position:relative;overflow:hidden;}
      .exec-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--orange);}
      .exec-title{font-size:11px;font-weight:700;color:var(--tx);margin-bottom:3px;}
      .exec-sub{font-size:9px;color:var(--t2);font-family:var(--mono);line-height:1.5;}
      .exec-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;}
      .exec-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;font-size:8px;font-family:var(--mono);font-weight:700;margin:2px 4px 0 0;border:1px solid var(--bd2);background:var(--s2);color:var(--t2);}
      .project-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px;}
      .project-name{font-size:11px;font-weight:700;color:var(--tx);}
      .project-meta{font-size:9px;color:var(--t2);font-family:var(--mono);margin-top:2px;}
      .project-risk{font-size:8px;font-family:var(--mono);font-weight:700;padding:2px 6px;border-radius:999px;border:1px solid var(--bd2);white-space:nowrap;}
      .project-bar{height:6px;background:var(--s3);border-radius:4px;overflow:hidden;margin:6px 0 5px;}
      .project-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--orange),var(--gold));}
      .ins-card{background:rgba(255,255,255,.02);}
      .ins-sev{display:inline-flex;align-items:center;justify-content:center;min-width:54px;padding:2px 6px;border-radius:999px;font-size:8px;font-family:var(--mono);font-weight:700;border:1px solid currentColor;}
      .ins-row{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;}
      .ins-copy{flex:1;min-width:0;}
      .ins-head{font-size:10px;font-weight:700;color:var(--tx);margin-bottom:3px;}
      .ins-body{font-size:10px;color:var(--t2);line-height:1.45;}
    `;
    var style=document.createElement('style');
    style.textContent=css;
    document.head.appendChild(style);
  }

  function injectInsightsTab(){
    var stabs=document.querySelector('.stabs');
    if(stabs && !document.querySelector('[data-tab="insights"]')){
      var tab=document.createElement('div');
      tab.className='stab';
      tab.setAttribute('data-tab','insights');
      tab.textContent='Insights';
      var risksTab=document.querySelector('[data-tab="risks"]');
      stabs.insertBefore(tab, risksTab || null);
      tab.addEventListener('click', function(){ if(typeof switchTab==='function') switchTab('insights'); });
    }
    var body=document.querySelector('.tab-body');
    if(body && !document.getElementById('tab-insights')){
      var pane=document.createElement('div');
      pane.className='tpane';
      pane.id='tab-insights';
      pane.innerHTML='\
        <div id="insightsSummaryEl"></div>\
        <div class="sttl" style="margin-top:12px">Recomendaciones automáticas</div>\
        <div id="insightsActionsEl"></div>\
        <div class="sttl" style="margin-top:12px">Portafolio por proyecto</div>\
        <div id="portfolioEl"></div>';
      var risksPane=document.getElementById('tab-risks');
      body.insertBefore(pane, risksPane || null);
    }
  }

  function installHelpers(){
    window.taskBlockedHours = function(task){
      return task && task.stat==='blocked' && typeof taskTotalHours==='function' ? taskTotalHours(task) : 0;
    };

    window.getVisibleProjectMetrics = function(){
      var projMap={};
      (typeof getVisibleTasks==='function' ? getVisibleTasks() : []).forEach(function(task){
        var key=(typeof getProjectName==='function' ? getProjectName(task) : (task.project||'')).trim() || 'Sin proyecto';
        if(!projMap[key]) projMap[key]={name:key,tasks:[],resources:new Set(),done:0,prog:0,blocked:0,todo:0,totalHours:0,blockedHours:0,highPending:0};
        var p=projMap[key];
        p.tasks.push(task);
        p.resources.add(task.rid);
        p[task.stat]=(p[task.stat]||0)+1;
        p.totalHours += typeof taskTotalHours==='function' ? taskTotalHours(task) : 0;
        p.blockedHours += taskBlockedHours(task);
        if(task.prio==='high' && task.stat!=='done') p.highPending += 1;
      });
      return Object.keys(projMap).map(function(key){
        var p=projMap[key];
        p.resourceCount = p.resources.size;
        p.total = p.tasks.length;
        p.completion = p.total ? Math.round((p.done/p.total)*100) : 0;
        p.inFlight = p.prog + p.blocked;
        p.riskScore = (p.blocked*3) + (p.highPending*2) + (p.blockedHours>0?2:0) + (p.completion<40 && p.total>=3 ? 1 : 0);
        p.riskLabel = p.riskScore>=6 ? 'ALTO' : p.riskScore>=3 ? 'MEDIO' : 'BAJO';
        return p;
      }).sort(function(a,b){ return b.riskScore-a.riskScore || a.name.localeCompare(b.name,'es',{sensitivity:'base'}); });
    };

    window.getExecutiveMetrics = function(){
      var vTasks=(typeof getVisibleTasks==='function' ? getVisibleTasks() : []);
      var vResources=(typeof getVisibleResources==='function' ? getVisibleResources() : []);
      var total=vTasks.length;
      var done=vTasks.filter(function(t){return t.stat==='done';}).length;
      var prog=vTasks.filter(function(t){return t.stat==='prog';}).length;
      var blocked=vTasks.filter(function(t){return t.stat==='blocked';}).length;
      var todo=vTasks.filter(function(t){return t.stat==='todo';}).length;
      var highPending=vTasks.filter(function(t){return t.prio==='high'&&t.stat!=='done';}).length;
      var blockedHours=vTasks.reduce(function(sum,t){return sum+taskBlockedHours(t);},0);
      var totalAvail=vResources.reduce(function(sum,r){return sum+monthAvailH(r.fid,CY,CM);},0);
      var totalUsed=vResources.reduce(function(sum,r){return sum+resUsedH(r.fid,CY,CM);},0);
      var freeCapacity=Math.max(0,totalAvail-totalUsed);
      var overloadCount=vResources.filter(function(r){return resUsedH(r.fid,CY,CM)>monthAvailH(r.fid,CY,CM);}).length;
      var warningCount=(typeof getWarns==='function' ? getWarns() : []).filter(function(w){ return vResources.some(function(r){return r.fid===w.rid;}); }).length;
      return {total:total,done:done,prog:prog,blocked:blocked,todo:todo,highPending:highPending,blockedHours:blockedHours,totalAvail:totalAvail,totalUsed:totalUsed,freeCapacity:freeCapacity,overloadCount:overloadCount,warningCount:warningCount,throughput:done,completion:total?Math.round((done/total)*100):0,utilization:totalAvail?Math.round((totalUsed/totalAvail)*100):0};
    };

    window.getExecutiveInsights = function(){
      var metrics=getExecutiveMetrics();
      var projects=getVisibleProjectMetrics();
      var insights=[];
      if(metrics.overloadCount>0){
        insights.push({severity:'ALTA',title:'Rebalancear capacidad del equipo',body:metrics.overloadCount+' recurso(s) están por encima de su capacidad mensual. Conviene mover tareas o reasignar horas antes de sumar trabajo nuevo.'});
      }
      if(metrics.blocked>0){
        insights.push({severity:'ALTA',title:'Atender bloqueos primero',body:'Hay '+metrics.blocked+' tarea(s) bloqueadas que representan '+metrics.blockedHours+'h detenidas. Resolver estos bloqueos dará más impacto que abrir trabajo adicional.'});
      }
      if(metrics.freeCapacity>=24){
        insights.push({severity:'MEDIA',title:'Capacidad libre disponible',body:'El equipo aún conserva '+metrics.freeCapacity+'h libres este mes. Puedes usar esa capacidad para absorber urgencias o adelantar iniciativas de alto valor.'});
      }
      if(metrics.highPending>0){
        insights.push({severity:'MEDIA',title:'Prioridades altas pendientes',body:'Existen '+metrics.highPending+' tarea(s) de alta prioridad sin completar. Conviene revisar si todas siguen siendo realmente críticas o si deben reordenarse.'});
      }
      if(projects.length){
        var topRisk=projects[0];
        insights.push({severity:topRisk.riskScore>=6?'ALTA':topRisk.riskScore>=3?'MEDIA':'BAJA',title:'Proyecto más sensible: '+topRisk.name,body:'Tiene '+topRisk.total+' tareas, '+topRisk.blocked+' bloqueada(s), '+topRisk.highPending+' alta(s) pendiente(s) y un avance de '+topRisk.completion+'%.'});
      }
      if(metrics.completion>=70 && metrics.blocked===0){
        insights.push({severity:'BAJA',title:'Buen ritmo de ejecución',body:'El avance visible va en '+metrics.completion+'% y no hay bloqueos activos. Es una buena ventana para cerrar pendientes medianos y consolidar entregas.'});
      }
      return insights.slice(0,6);
    };

    window.renderInsights = function(){
      var metrics=getExecutiveMetrics();
      var insights=getExecutiveInsights();
      var projects=getVisibleProjectMetrics();
      var summaryEl=document.getElementById('insightsSummaryEl');
      var actionsEl=document.getElementById('insightsActionsEl');
      var portfolioEl=document.getElementById('portfolioEl');
      if(summaryEl){
        summaryEl.innerHTML=''+
          '<div class="exec-grid">'+
            '<div class="exec-card"><div class="exec-title">Resumen ejecutivo</div><div class="exec-sub">Utilización actual: <b style="color:var(--orange)">'+metrics.utilization+'%</b><br>Capacidad libre: <b style="color:var(--done)">'+metrics.freeCapacity+'h</b><br>Throughput visible: <b>'+metrics.throughput+' tareas done</b></div></div>'+
            '<div class="exec-card"><div class="exec-title">Estado operativo</div><div class="exec-sub">Bloqueadas: <b style="color:var(--block)">'+metrics.blocked+'</b><br>Alta prioridad pendiente: <b style="color:var(--med)">'+metrics.highPending+'</b><br>Recursos sobrecargados: <b>'+(metrics.overloadCount||0)+'</b></div></div>'+
          '</div>'+
          '<div>'+ 
            '<span class="exec-pill">📊 '+metrics.total+' tareas visibles</span>'+ 
            '<span class="exec-pill">👥 '+(typeof getVisibleResources==='function' ? getVisibleResources().length : 0)+' recursos</span>'+ 
            '<span class="exec-pill">📁 '+projects.length+' proyectos</span>'+ 
            '<span class="exec-pill">⚠ '+(metrics.warningCount+metrics.overloadCount+metrics.blocked)+' señales de atención</span>'+ 
          '</div>';
      }
      if(actionsEl){
        actionsEl.innerHTML = insights.length ? insights.map(function(item){
          var color=item.severity==='ALTA'?'var(--block)':item.severity==='MEDIA'?'var(--med)':'var(--done)';
          return '<div class="ins-card"><div class="ins-row"><div class="ins-copy"><div class="ins-head">'+item.title+'</div><div class="ins-body">'+item.body+'</div></div><div class="ins-sev" style="color:'+color+'">'+item.severity+'</div></div></div>';
        }).join('') : '<div class="exec-card"><div class="exec-title">Sin alertas automáticas</div><div class="exec-sub">No se detectan acciones críticas con la vista actual.</div></div>';
      }
      if(portfolioEl){
        portfolioEl.innerHTML = projects.length ? projects.map(function(p){
          var riskColor=p.riskLabel==='ALTO'?'var(--block)':p.riskLabel==='MEDIO'?'var(--med)':'var(--done)';
          return '<div class="project-card">'+
            '<div class="project-top"><div><div class="project-name">'+p.name+'</div><div class="project-meta">'+p.total+' tareas · '+p.resourceCount+' recurso(s) · '+p.totalHours+'h estimadas</div></div><div class="project-risk" style="color:'+riskColor+'">'+p.riskLabel+'</div></div>'+
            '<div class="project-bar"><div class="project-fill" style="width:'+p.completion+'%"></div></div>'+
            '<div class="vlbls"><span>'+p.completion+'% completado</span><span>'+p.prog+' en curso</span><span>'+p.blocked+' bloqueadas</span></div>'+
            '<div style="margin-top:6px">'+
              '<span class="exec-pill">✅ '+p.done+' done</span>'+
              '<span class="exec-pill">⚡ '+p.prog+' prog</span>'+
              (p.blocked?'<span class="exec-pill" style="color:var(--block)">🚫 '+p.blocked+' blocked</span>':'')+
              (p.highPending?'<span class="exec-pill" style="color:var(--med)">🔴 '+p.highPending+' alta</span>':'')+
            '</div>'+
          '</div>';
        }).join('') : '<div class="exec-card"><div class="exec-title">Sin proyectos visibles</div><div class="exec-sub">Agrega el campo proyecto a las tareas para obtener vista de portafolio.</div></div>';
      }
    };
  }

  function patchRender(){
    var originalRender=window.render;
    window.render=function(){
      var result = originalRender.apply(this, arguments);
      if(typeof renderInsights==='function') renderInsights();
      patchDashboard();
      return result;
    };
  }

  function patchDashboard(){
    var metrics=getExecutiveMetrics();
    var kpiGrid=document.getElementById('kpiGrid');
    if(kpiGrid){
      kpiGrid.innerHTML=
        '<div class="kcard" style="--kc:var(--done)"><div class="kv">'+metrics.completion+'%</div><div class="kl">Completado</div><div class="ks">'+metrics.done+'/'+metrics.total+' tareas</div></div>'+
        '<div class="kcard" style="--kc:var(--prog)"><div class="kv">'+metrics.prog+'</div><div class="kl">En curso</div><div class="ks">trabajo activo</div></div>'+
        '<div class="kcard" style="--kc:'+(metrics.blocked>0?'var(--block)':'var(--t3)')+'"><div class="kv">'+metrics.blocked+'</div><div class="kl">Bloqueadas</div><div class="ks">'+metrics.blockedHours+'h detenidas</div></div>'+
        '<div class="kcard" style="--kc:var(--orange)"><div class="kv">'+metrics.utilization+'%</div><div class="kl">Utilización</div><div class="ks">'+metrics.totalUsed+'h / '+metrics.totalAvail+'h</div></div>'+
        '<div class="kcard" style="--kc:var(--vacation)"><div class="kv">'+metrics.freeCapacity+'h</div><div class="kl">Capacidad libre</div><div class="ks">margen operativo</div></div>'+
        '<div class="kcard" style="--kc:'+(metrics.highPending>0?'var(--med)':'var(--done)')+'"><div class="kv">'+metrics.highPending+'</div><div class="kl">Alta prioridad</div><div class="ks">pendientes</div></div>';
    }
    var chips=document.getElementById('schips');
    if(chips){
      chips.innerHTML=
        '<span class="badge b-todo">📋 '+metrics.todo+' TO DO</span>'+
        '<span class="badge b-prog">⚡ '+metrics.prog+' EN CURSO</span>'+
        '<span class="badge b-done">✅ '+metrics.done+' DONE</span>'+
        (metrics.blocked>0?'<span class="badge b-blocked">🚫 '+metrics.blocked+' BLOCKED</span>':'')+
        (metrics.overloadCount>0?'<span class="badge" style="background:rgba(253,81,21,.12);color:var(--orange);border:1px solid rgba(253,81,21,.25)">🔥 '+metrics.overloadCount+' sobrecargados</span>':'');
    }
  }

  waitForReady();
})();