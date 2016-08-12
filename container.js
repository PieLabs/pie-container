  (function (root) {

  /** Custom element + ui handler */
  function Container(questions, env, sessions, processing) {
    
    env = env || { mode: 'gather', locale: 'en_US' };

    sessions = sessions || [];
    
    //TODO - rm from pie - should be on sample page
    function logSession() {
      setTimeout(function () {
        $('.session-preview > textarea').val(JSON.stringify(sessions, null, '  '));
      }, 100);
      setTimeout(logSession, 2000);
    }

    logSession();

    function applySetter(el, name, value){
      var prototype = Object.getPrototypeOf(el);
      var descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if(!descriptor || !_.isFunction(descriptor.set)){
        throw new Error('Custom element: ' + el.nodeName + ' is missing a setter for "model"')
      }
      el[name] = value;
    } 

    document.addEventListener('DOMContentLoaded', function () {
      
      //TODO.. remove this timeout.
      setTimeout(function(){

        console.log('[pie] page loaded - init....');
        var els = [];

        document.addEventListener('pie.envChanged', function (event) {
          
          processing.model(questions, sessions, event.target.env)
            .then(function(models) {
              _.map(models, function (o) {
                var el = _.find(els, function (e) {
                  return e.getAttribute('data-id') === o.id;
                });
                
                applySetter(el, 'model', o.model);
                //@deprecated - to be removed - to support older components
                el.state = o.model;
              });
            })
            .catch(function(err){
              console.error(err);
            });
        });

        var elements = document.querySelectorAll('[data-id]');

        for (var i = 0; i < elements.length; ++i) {
          var el = elements[i];
          els.push(el);
          var id = el.getAttribute('data-id');

          var question = _.find(questions, { id: id });
          var session = _.find(sessions, { id: id });

          if (!session) {
            session = { id: id };
            sessions.push(session);
          }
          applySetter(el, 'session', session);
        }

        var controlPanel = document.querySelector('pie-control-panel');

        if (controlPanel) {
          controlPanel.env = env;
        }
        
      }, 1000);
      

    });
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

    this.listFrameworksAndTheirElements = function(){
      return _.mapValues(registeredFrameworks, function(f){
          return _.keys(f);
      });
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

    console.log('overide pie...');
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

    this.frameworksAndElements = function(){
      return frameworks.listFrameworksAndTheirElements();
    };
    var newContainer = function (model, mode, session, processing) {
      return new Container(model, mode, session, processing);
    }.bind(this);
    
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

  if(root.pie){
    throw new Error('pie is already defined, can not reregister instance - are you loading 2 containers?');
  } else {
    root.pie = new Pie();
  }

})(this);


