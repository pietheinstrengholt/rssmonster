<?php namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Response;

class LumenCors {

	protected $settings = array(
				'origin' => '*',	// Wide Open!
				'allowMethods' => 'GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS',
				);

	protected function setOrigin($req, $rsp) {
		$origin = $this->settings['origin'];
		if (is_callable($origin)) {
			// Call origin callback with request origin
			$origin = call_user_func($origin,
									$req->header("Origin")
									);
		}
		$rsp->header('Access-Control-Allow-Origin', $origin);
	}

	protected function setExposeHeaders($req, $rsp) {
		if (isset($this->settings['exposeHeaders'])) {
			$exposeHeaders = $this->settings['exposeHeaders'];
			if (is_array($exposeHeaders)) {
				$exposeHeaders = implode(", ", $exposeHeaders);
			}

			$rsp->header('Access-Control-Expose-Headers', $exposeHeaders);
		}
	}

	protected function setMaxAge($req, $rsp) {
		if (isset($this->settings['maxAge'])) {
			$rsp->header('Access-Control-Max-Age', $this->settings['maxAge']);
		}
	}

	protected function setAllowCredentials($req, $rsp) {
		if (isset($this->settings['allowCredentials']) && $this->settings['allowCredentials'] === True) {
			$rsp->header('Access-Control-Allow-Credentials', 'true');
		}
	}

	protected function setAllowMethods($req, $rsp) {
		if (isset($this->settings['allowMethods'])) {
			$allowMethods = $this->settings['allowMethods'];
			if (is_array($allowMethods)) {
				$allowMethods = implode(", ", $allowMethods);
			}

			$rsp->header('Access-Control-Allow-Methods', $allowMethods);
		}
	}

	protected function setAllowHeaders($req, $rsp) {
		if (isset($this->settings['allowHeaders'])) {
			$allowHeaders = $this->settings['allowHeaders'];
			if (is_array($allowHeaders)) {
				$allowHeaders = implode(", ", $allowHeaders);
			}
		}
		else {  // Otherwise, use request headers
			$allowHeaders = $req->header("Access-Control-Request-Headers");
		}

		if (isset($allowHeaders)) {
			$rsp->header('Access-Control-Allow-Headers', $allowHeaders);
		}
	}

	protected function setCorsHeaders($req, $rsp) {

		// http://www.html5rocks.com/static/images/cors_server_flowchart.png
		// Pre-flight
		if ($req->isMethod('OPTIONS')) {
			$this->setOrigin($req, $rsp);
			$this->setMaxAge($req, $rsp);
			$this->setAllowCredentials($req, $rsp);
			$this->setAllowMethods($req, $rsp);
			$this->setAllowHeaders($req, $rsp);
		}
		else {
			$this->setOrigin($req, $rsp);
			$this->setExposeHeaders($req, $rsp);
			$this->setAllowCredentials($req, $rsp);
		}
	}

	/**
	 * Handle an incoming request.
	 *
	 * @param  \Illuminate\Http\Request  $request
	 * @param  \Closure  $next
	 * @return mixed
	 */
	public function handle($request, Closure $next) {

		if ($request->isMethod('OPTIONS')) {
			$response = new Response("", 200);
		}
		else {
			$response = $next($request);
		}

		$this->setCorsHeaders($request, $response);

		return $response;
	}

}
