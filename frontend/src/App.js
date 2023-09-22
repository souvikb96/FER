import Button from "@material-ui/core/Button"
import IconButton from "@material-ui/core/IconButton"
import TextField from "@material-ui/core/TextField"
import AssignmentIcon from "@material-ui/icons/Assignment"
import PhoneIcon from "@material-ui/icons/Phone"
import React, { useEffect, useRef, useState } from "react"
import { CopyToClipboard } from "react-copy-to-clipboard"
import Peer from "simple-peer"
import io from "socket.io-client"
import "./App.css"
import * as faceapi from "face-api.js";
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import axios from "axios";

const socket = io.connect('http://localhost:5000')
const authorizationEndpoint = "http://localhost:3001/api/get-speech-token";
let subscriptionKey = "d0959b0f050143fda6d4a962d9a95449"

function App() {
	const [ me, setMe ] = useState("")
	const [ stream, setStream ] = useState()
	const [ name, setName ] = useState("")
	const [ callerName, setCallerName ] = useState("")

	const [ caller, setCaller ] = useState("")
	const [ idToCall, setIdToCall ] = useState("")
	const [ callerSignal, setCallerSignal ] = useState()

	const [ receivingCall, setReceivingCall ] = useState(false)
	const [ callAccepted, setCallAccepted ] = useState(false)
	const [ callEnded, setCallEnded] = useState(false)

	const myVideo = useRef()
	const userVideo = useRef()
	const connectionRef= useRef()

	let expressions = {}
	let transcript = {}

	let expressions_transcript = {}
	let last_speech_recognised_timestamp = 0

	const canvasRef = useRef();

	let SpeechSDK = undefined;
	if (!!window.SpeechSDK) {
		SpeechSDK = window.SpeechSDK;
	}
	let region = "eastus";
    var reco;
    let authorizationToken = undefined;
	let phraseDiv = document.getElementById("phraseDiv");
	
    

	useEffect(() => {
		
		navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
			setStream(stream)
				myVideo.current.srcObject = stream
		})

		socket.on("me", (id) => {
			setMe(id)
		})

		socket.on("callUser", (data) => {
			setReceivingCall(true)
			setCaller(data.from)
			setCallerName(data.name)
			setCallerSignal(data.signal)
		})

		socket.on("callEnded", (data) => {
			setReceivingCall(false)
			setCallAccepted(false)
			setCallEnded(false)
			setCaller("")
			setCallerName("")
			setCallerSignal("")
			setIdToCall("")
			window.location.reload();
		})

		Initialize(async function (speechSdkParam) {
			SpeechSDK = speechSdkParam;

			// in case we have a function for getting an authorization token, call it.
			if (typeof RequestAuthorizationToken === "function") {
				await RequestAuthorizationToken();
			}
		});

	}, [])
	
	/*
	useEffect(() => {
		userVideo.current && loadModels();
	},[userVideo.current])
	*/

	async function RequestAuthorizationToken() {
		if (authorizationEndpoint) {
			try {
				const res = await axios.get(authorizationEndpoint);
				const token = res.data.token;
				const regionValue = res.data.region;
				region = regionValue;
				authorizationToken = token;

				//console.log('Token fetched from back-end: ' + token);
			} catch (err) {
				console.log(err);
			}
		}
	}

	function Initialize(onComplete) {
		//console.log(window.SpeechSDK)
		if (!!window.SpeechSDK) {
			onComplete(window.SpeechSDK);
		}
		else{
			//window.alert("Hi")
		}
	}

	function getAudioConfig() {
		// If an audio file was specified, use it. Otherwise, use the microphone.
		// Depending on browser security settings, the user may be prompted to allow microphone use. Using
		// continuous recognition allows multiple phrases to be recognized from a single use authorization.
		//console.log(SpeechSDK)
		return SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
		
	}

	function getSpeechConfig(sdkConfigType) {
		let speechConfig;
		if (authorizationToken) {
			speechConfig = sdkConfigType.fromAuthorizationToken(authorizationToken, region);
		}
		else {
			speechConfig = sdkConfigType.fromSubscription(subscriptionKey, region);
		}

		// Defines the language(s) that speech should be translated to.
		// Multiple languages can be specified for text translation and will be returned in a map.
		if (sdkConfigType == SpeechSDK.SpeechTranslationConfig) {
			speechConfig.addTargetLanguage("en-US");
		}

		speechConfig.speechRecognitionLanguage = "en-US";
		return speechConfig;
	}

	function doContinuousRecognition() {
		
		var audioConfig = getAudioConfig();
		var speechConfig = getSpeechConfig(SpeechSDK.SpeechConfig);
		//console.log(speechConfig)
		if (!speechConfig) return;

		

		// Create the SpeechRecognizer and set up common event handlers and PhraseList data
		reco = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
		//console.log(reco)
		applyCommonConfigurationTo(reco);

		// Start the continuous recognition. Note that, in this continuous scenario, activity is purely event-
		// driven, as use of continuation (as is in the single-shot sample) isn't applicable when there's not a
		// single result.
		reco.startContinuousRecognitionAsync();
	}

	function applyCommonConfigurationTo(recognizer) {
		// The 'recognizing' event signals that an intermediate recognition result is received.
		// Intermediate results arrive while audio is being processed and represent the current "best guess" about
		// what's been spoken so far.
		recognizer.recognizing = onRecognizing;

		// The 'recognized' event signals that a finalized recognition result has been received. These results are
		// formed across complete utterance audio (with either silence or eof at the end) and will include
		// punctuation, capitalization, and potentially other extra details.
		// 
		// * In the case of continuous scenarios, these final results will be generated after each segment of audio
		//   with sufficient silence at the end.
		// * In the case of intent scenarios, only these final results will contain intent JSON data.
		// * Single-shot scenarios can also use a continuation on recognizeOnceAsync calls to handle this without
		//   event registration.
		recognizer.recognized = onRecognized;

		// The 'canceled' event signals that the service has stopped processing speech.
		// https://docs.microsoft.com/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognitioncanceledeventargs?view=azure-node-latest
		// This can happen for two broad classes of reasons:
		// 1. An error was encountered.
		//    In this case, the .errorDetails property will contain a textual representation of the error.
		// 2. No additional audio is available.
		//    This is caused by the input stream being closed or reaching the end of an audio file.
		recognizer.canceled = onCanceled;

		// The 'sessionStarted' event signals that audio has begun flowing and an interaction with the service has
		// started.
		recognizer.sessionStarted = onSessionStarted;

		// The 'sessionStopped' event signals that the current interaction with the speech service has ended and
		// audio has stopped flowing.
		recognizer.sessionStopped = onSessionStopped;

		// PhraseListGrammar allows for the customization of recognizer vocabulary.
		// The semicolon-delimited list of words or phrases will be treated as additional, more likely components
		// of recognition results when applied to the recognizer.
		//
		// See https://docs.microsoft.com/azure/cognitive-services/speech-service/get-started-speech-to-text#improve-recognition-accuracy
	}

	function onRecognizing(sender, recognitionEventArgs) {
		var result = recognitionEventArgs.result;
		// Update the hypothesis line in the phrase/result view (only have one)
		phraseDiv.innerHTML = phraseDiv.innerHTML.replace(/(.*)(^|[\r\n]+).*\[\.\.\.\][\r\n]+/, '$1$2')
			+ `${result.text} [...]\r\n`;
		phraseDiv.scrollTop = phraseDiv.scrollHeight;
	}

	function onRecognized(sender, recognitionEventArgs) {
		var result = recognitionEventArgs.result;
		onRecognizedResult(recognitionEventArgs.result);
	}

	function onRecognizedResult(result) {
		//console.log(result.reason == SpeechSDK.ResultReason.RecognizedSpeech)
		//console.log(result.text)
		if(!result.text){
			return
		}
		phraseDiv.scrollTop = phraseDiv.scrollHeight;
		phraseDiv.innerHTML = phraseDiv.innerHTML.replace(/(.*)(^|[\r\n]+).*\[\.\.\.\][\r\n]+/, '$1$2');
		

		switch (result.reason) {
			case SpeechSDK.ResultReason.NoMatch:
			case SpeechSDK.ResultReason.Canceled:
			case SpeechSDK.ResultReason.RecognizedSpeech:
				//console.log("Hi")
				phraseDiv.value += `${result.text}\r\n`;

				var intentJson = result.properties
					.getProperty(SpeechSDK.PropertyId.LanguageUnderstandingServiceResponse_JsonResult);
				if (intentJson) {
					phraseDiv.value += `${intentJson}\r\n`;
				}

				if (result.translations) {
					var resultJson = JSON.parse(result.json);
					resultJson['privTranslationPhrase']['Translation']['Translations'].forEach(
						function (translation) {
						phraseDiv.value += ` [${translation.Language}] ${translation.Text}\r\n`;
					});
				}

				transcript[(new Date).getTime()] = result.text
				last_speech_recognised_timestamp = (new Date).getTime()
				expressions_transcript[(new Date).getTime()] = {"transcript" : result.text}

				console.log(expressions_transcript)
				break;
			case SpeechSDK.ResultReason.TranslatedSpeech:
			case SpeechSDK.ResultReason.RecognizedIntent:
		}
	}

	function onSessionStarted(sender, sessionEventArgs) {	
	}

	function onSessionStopped(sender, sessionEventArgs) {
	}

	function onCanceled (sender, cancellationEventArgs) {
		window.console.log(cancellationEventArgs);
	}


	const callUser = (id) => {
		const peer = new Peer({
			initiator: true,
			trickle: false,
			stream: stream
		})
		peer.on("signal", (data) => {
			socket.emit("callUser", {
				userToCall: id,
				signalData: data,
				from: me,
				name: name
			})
		})
		peer.on("stream", (stream) => {
			userVideo.current.srcObject = stream
		})
		socket.on("callAccepted", (data) => {
			setCallAccepted(true)
			peer.signal(data.signal)
			setCaller(data.from)
			setCallerName(data.name)
			loadModels();
			doContinuousRecognition();
		})

		connectionRef.current = peer

		
	}

	const answerCall =() =>  {
		setCallAccepted(true)
		const peer = new Peer({
			initiator: false,
			trickle: false,
			stream: stream
		})
		peer.on("signal", (data) => {
			socket.emit("answerCall", { signal: data, to: caller, name: name })
		})
		peer.on("stream", (stream) => {
			userVideo.current.srcObject = stream
		})

		peer.signal(callerSignal)
		connectionRef.current = peer

		loadModels();

		doContinuousRecognition()
	}

	const rejectCall = () => {
		setCallEnded(false)
		setCallAccepted(false)
		setReceivingCall(false)
		setCaller("")
		setCallerName("")
		setCallerSignal(null)
		setIdToCall("")
	}

	const leaveCall = () => {
		socket.emit("callEnded")
		connectionRef.current.destroy()

		setReceivingCall(false)
		setCallAccepted(false)
		setCallEnded(false)
		setCaller("")
		setCallerName("")
		setCallerSignal("")
		setIdToCall("")

		window.location.reload()
	}

	const loadModels = () => {
		Promise.all([
		  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
		  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
		  faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
		  faceapi.nets.faceExpressionNet.loadFromUri('/models'),
		]).then(() => {
		  faceDetection();
		})
	};

	const faceDetection = async () => {
		let interval = setInterval(async() => {
			if(userVideo.current){
				const detections = await faceapi.detectAllFaces(userVideo.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions();

				if(detections){
					if(detections.length > 0){
						//console.log(detections[0].expressions.happy)
						//console.log(Object.keys(detections[0].expressions).reduce((a, b) => detections[0].expressions[a] > detections[0].expressions[b] ? a : b))
						//let date = new Date();
						//let showTime = date.getHours() + ':' + date.getMinutes() + ":" + date.getSeconds();
						expressions[(new Date).getTime()] = Object.keys(detections[0].expressions).reduce((a, b) => detections[0].expressions[a] > detections[0].expressions[b] ? a : b)
						
						if(Number((new Date).getTime()) - last_speech_recognised_timestamp <= 3000){
							expressions_transcript[(new Date).getTime()] = {"emotion" : Object.keys(detections[0].expressions).reduce((a, b) => detections[0].expressions[a] > detections[0].expressions[b] ? a : b)}

							console.log(expressions_transcript)
						}
						
					}
				}
				
				
				canvasRef.current.innerHtml = faceapi.createCanvasFromMedia(userVideo.current);
				faceapi.matchDimensions(canvasRef.current, {
					width: 940,
					height: 650,
				})
			
				const resized = faceapi.resizeResults(detections, {
					width: 940,
					height: 650,
				});
			
				faceapi.draw.drawDetections(canvasRef.current, resized)
				faceapi.draw.drawFaceLandmarks(canvasRef.current, resized)
				faceapi.draw.drawFaceExpressions(canvasRef.current, resized)
			}
			else{
				clearInterval(interval)
			}
	
		}, 1000)
	}

	return (
		<>
		{
		(!SpeechRecognition.browserSupportsSpeechRecognition()) ? window.alert("Your Browser doesn't support Speech Recognition") : null
		}
		<h1 style={{ textAlign: "center", color: '#fff' }}>Let's Call</h1>
		<div className="container">
			<div className="video-container">
				<div className="video">
					{stream &&  <><p style={{color: "white", fontSize: "25px"}}>{name}</p><video playsInline muted ref={myVideo} autoPlay style={{ width: "350px" }} /></>}
				</div>
				<div className="video">
					{callAccepted && !callEnded ?
					<><p style={{color: "white", fontSize: "25px"}}>{callerName}</p><video playsInline ref={userVideo} autoPlay style={{ width: "350px"}} /></>:
					null}
				</div>
				<canvas ref={canvasRef} width="940" height="650" className='app__canvas' />
			</div>
			<div className="myId">
				<TextField
					id="filled-basic"
					label="Name"
					variant="filled"
					value={name}
					onChange={(e) => setName(e.target.value)}
					style={{ marginBottom: "20px" }}
				/>
				<CopyToClipboard text={me} style={{ marginBottom: "2rem" }}>
					<Button variant="contained" color="primary" startIcon={<AssignmentIcon fontSize="large" />}>
						Copy ID
					</Button>
				</CopyToClipboard>

				<TextField
					id="filled-basic"
					label="ID to call"
					variant="filled"
					value={idToCall}
					onChange={(e) => setIdToCall(e.target.value)}
				/>
				<div className="call-button">
					{callAccepted && !callEnded ? (
						<Button variant="contained" color="secondary" onClick={leaveCall}>
							End Call
						</Button>
					) : (
						<Button variant="contained" color="primary" onClick={() => callUser(idToCall)}>
							<PhoneIcon fontSize="large" />
						</Button>
					)}
				</div>
				<div>
					<br/>
					<textarea id="phraseDiv" style={{display : "inline-block", width:"300px", height:"150px"}}></textarea>
				</div>
			</div>
			<div>
				{receivingCall && !callAccepted ? (
						<div className="caller">
						<h1 >{callerName} is calling...</h1>
						<Button variant="contained" color="primary" onClick={answerCall}>
							Answer
						</Button>
						&nbsp; &nbsp; &nbsp; &nbsp; 
						<Button variant="contained" color="secondary" onClick={rejectCall}>
							Reject
						</Button>
					</div>
				) : null}
			</div>
		</div>
		</>
	)
}

export default App
