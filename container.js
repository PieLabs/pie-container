(function (root) {

  /** Custom element + ui handler */
  function Container(questions, env, sessions, processing) {
    
    env = env || { mode: 'gather', locale: 'en_US' };

    sessions = sessions || [];
    
    //TODO - rm from pie - should be on sample page
    function logSession() {
      setTimeout(function () {
        $('.session-preview > textarea').val(JSON.stringify(sessions, null, '  '));
        logSession();
      }, 1000);
    }

    logSession();

    document.addEventListener('DOMContentLoaded', function () {
      
      setTimeout(function(){

        console.log('[pie] page loaded - init....');
        var els = [];

        document.addEventListener('pie.envChanged', function (event) {
          els.forEach(function (e) {
            //TODO: find the optimal way of propogating env changes into the components.
            //Note: have to clone the instance for polymer to pick it up.
            if (!_.isEqual(e.env, event.detail)) {
              e.env = _.cloneDeep(event.detail);
            }
          });

          if (env.mode === 'evaluate') {
            processing.evaluate(questions, sessions)
              .then(function (outcomes) {
                _.map(outcomes, function (o) {
                  var el = _.find(els, function (e) {
                    return e.getAttribute('data-id') === o.id;
                  });

                  el.outcome = o.outcome;
                });
              })
              .catch(function (e) {
                console.log(e.stack);
                console.error('error processing...', e);
              });
          }
        });

        var elements = document.querySelectorAll('[data-id]');

        for (var i = 0; i < elements.length; ++i) {
          var el = elements[i];
          els.push(el);
          var id = el.getAttribute('data-id');

          var question = _.find(questions, { id: id });
          var session = _.find(sessions, { id: id });

          if (!session) {
            session = {id: id};
            sessions.push(session);
          }

          el.session = session;
          //See pie.envChanged event handler, need to give each element a copy of the env.
          el.env = _.cloneDeep(env);
          el.question = question;
        }

        var controlPanel = document.querySelector('pie-control-panel');

        if (controlPanel) {
          controlPanel.env = env;
        }
        
      }, 1000);
      

    });
  }

  function ClientSideProcessing(frameworks) {

    var processors = {};

    this.register = function (name, logic) {
      processors[name] = logic;
    };

    this.evaluate = function (questions, sessions) {
      return new Promise(function (resolve, reject) {

        var questionAndSessions = _.map(questions, function (q) {
          var session = _.find(sessions, { id: q.id });
          return { question: q, session: _.cloneDeep(session) }
        });

        var out = _.map(questionAndSessions, function (qs) {
          var logic = processors[qs.question.component.name];
          if (logic && _.isFunction(logic.createOutcome)) {
            var frameworkProcessor = frameworks.processing(qs.question.component.name);
            var outcome;

            if (frameworkProcessor && _.isFunction(frameworkProcessor.createOutcome)) {
              //Note: for the frameworkProcessor we pass in the session
              outcome = frameworkProcessor.createOutcome(logic, qs.question, qs.session, {});
            } else {
              //TODO: Spec out settings for createOutcome
              outcome = logic.createOutcome(qs.question, qs.session.response, {highlightUserResponse: true});
            }
            
            return { id: qs.question.id, component: qs.question.component, outcome: outcome };
          } else {
            console.warn('no processor found for: ', qs.question.component.name);
            return { id: qs.question.id };
          }
        });
        resolve(out);
      });
    };
  }
  
  function Frameworks() {
    
    var contentLoaded = false;
    document.addEventListener('DOMContentLoaded', function(){
      console.log('framework - content is now loaded');
      contentLoaded = true; 
    });
    
    var registeredFrameworks = {};
    
    /**
     * Return a processing object for the element.
     * This processing object allows that framework to broker evaluate calls to the underlying logic.
     */
    this.processing = function (elementName) {

      var key = _(registeredFrameworks).keys().find(function (k) {
        var framework = registeredFrameworks[k];
        return _.isFunction(framework.supportsElement) && framework.supportsElement(elementName);
      });

      if (key) {
        return registeredFrameworks[key].processing;
      }
    };

    this.elementApi = function (name) {
      if (!registeredFrameworks[name]) {
        throw new Error('unsupported framework: ', name);
      }
      return new ElementApi(registeredFrameworks[name]);
    };
    
    this.getFramework = function(name){
       var out = registeredFrameworks[name];
       if(out){
         return out; 
       } else {
         throw new Error('no framework named: ' + name);
       }
    };
    
    this.addFramework = function (frameworkName, def) {
      if (registeredFrameworks[frameworkName]) {
        throw new Error('already registered: ' + frameworkName);
      } else {
        
        if(def.register) {
          throw new Error('The framework definition ' + frameworkName + ' has \'register\' defined - this is a reserved name in pie.')
        } 
        
        //Add register method used by elements        
        def.register = function(){
          
          if(contentLoaded){
            throw new Error('the content has already been loaded');
          }
          
          def.registeredElements = def.registeredElements || {};
          var args = Array.prototype.slice.call(arguments);
          var name = args[0];
          var prototype = this.definePrototype.apply(this, args); 
          var Constructor = document.registerElement(name, { prototype: prototype });
          console.log('registerElement, name:', name, ' prototype: ', prototype);
          def.registeredElements[name] = { Constructor: Constructor, prototype: prototype};
        }.bind(def);
        
        registeredFrameworks[frameworkName] = def;
      }
    };
  }

  function Pie() {

    var frameworks = new Frameworks();

    /**
     * @param name the framework name to register with
     * @return [ElementApi] for the framework
     */
    this.framework = function (name) {
      return frameworks.getFramework(name);
    }

    this.addFramework = function (frameworkName, def) {
      frameworks.addFramework(frameworkName, def);
    }

    var newContainer = function (model, mode, session, processing) {
      console.log('this:', this);
      return new Container(model, mode, session, processing);
    }.bind(this);
    
    //Expose the default client side processor 
    this.clientSideProcessor = new ClientSideProcessing(frameworks);
    
    var require = function(p, m) {
      if(!p){
        throw new Error(m);
      }
    };
    
    /**
     * @param processor : { 
     *   evaluate: (questions, sessions) => Promise<[{id: string, component: {name:string,version:string}, outcome: any}]>
     * }
     */
    this.Container = function (model, mode, session, processing) {
      require(model, 'model not defined'); 
      require(mode, 'mode not defined'); 
      require(session, 'session not defined'); 
      require(processing, 'processing not defined'); 
      
      return newContainer(model, mode, session, processing);
    }
  };

  root.pie = root.pie || {};
  root.pie = new Pie();

})(this);
