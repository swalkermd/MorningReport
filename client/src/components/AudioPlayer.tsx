import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause } from "lucide-react";
import introMusicPath from "@assets/news-intro-344332_1762626212380.mp3";

interface AudioPlayerProps {
  audioPath?: string | null;
  audioPaths?: string[] | null;
  reportDate: string | Date;
  "data-testid"?: string;
}

export function AudioPlayer({ audioPath, audioPaths, reportDate, "data-testid": testId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segmentDurations, setSegmentDurations] = useState<number[]>([]);

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [currentReport, setCurrentReport] = useState<string | null | undefined>(audioPath);
  const loadedAudioPathRef = useRef<string | null>(null);
  const introEndedHandlerRef = useRef<(() => void) | null>(null);
  const hasPlayedIntroRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  
  // Sync ref with state to avoid stale closures
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  
  // Use audioPaths array if available, otherwise fall back to single audioPath
  // Memoize to prevent effect from retriggering on every render
  const audioSegments = useMemo(
    () => audioPaths && audioPaths.length > 0 ? audioPaths : (audioPath ? [audioPath] : []),
    [audioPaths, audioPath]
  );

  // Load durations for all segments
  useEffect(() => {
    const loadDurations = async () => {
      const durations: number[] = [];
      
      for (const path of audioSegments) {
        const audio = new Audio(path);
        audio.playbackRate = 1.1;
        
        try {
          await new Promise<void>((resolve) => {
            let resolved = false;
            let timeoutId: NodeJS.Timeout | null = null;
            
            const cleanup = (duration: number) => {
              if (!resolved) {
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                durations.push(duration);
                resolve();
              }
            };
            
            const handleMetadata = () => {
              const dur = (audio.duration && !isNaN(audio.duration)) ? audio.duration : 0;
              cleanup(dur);
            };
            
            const handleError = () => {
              cleanup(0);
            };
            
            const handleTimeout = () => {
              cleanup(0);
            };
            
            audio.addEventListener('loadedmetadata', handleMetadata, { once: true });
            audio.addEventListener('error', handleError, { once: true });
            
            // Timeout after 5 seconds
            timeoutId = setTimeout(handleTimeout, 5000);
          });
        } catch (error) {
          durations.push(0);
        }
      }
      
      setSegmentDurations(durations);
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      setDuration(totalDuration);
    };
    
    if (audioSegments.length > 0) {
      loadDurations();
    }
  }, [audioSegments]);

  useEffect(() => {
    if (!introAudioRef.current) {
      introAudioRef.current = new Audio(introMusicPath);
      introAudioRef.current.playbackRate = 1.1;
    }
    
    return () => {
      // Clean up event listeners
      if (introEndedHandlerRef.current && introAudioRef.current) {
        introAudioRef.current.removeEventListener("ended", introEndedHandlerRef.current);
        introEndedHandlerRef.current = null;
      }
      
      if (introAudioRef.current) {
        introAudioRef.current.pause();
        introAudioRef.current = null;
      }
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
        mainAudioRef.current = null;
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (audioPath && audioPath !== currentReport) {
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
        mainAudioRef.current = null;
        loadedAudioPathRef.current = null;
      }
      setIsPlaying(false);
      setIsIntroPlaying(false);
      setCurrentSegment(0);
      setCurrentReport(audioPath);
      hasPlayedIntroRef.current = false; // Reset intro flag for new report
    }

    const currentAudioPath = audioSegments[currentSegment];
    
    // Only create new Audio if we haven't loaded this path yet
    if (currentAudioPath && loadedAudioPathRef.current !== currentAudioPath) {
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
      }
      
      const main = new Audio(currentAudioPath);
      main.playbackRate = 1.1;
      mainAudioRef.current = main;
      loadedAudioPathRef.current = currentAudioPath;
      
      const handleEnded = async () => {
        const intro = introAudioRef.current;
        if (!intro) return;
        
        // Play intro music between segments or at the end
        setIsIntroPlaying(true);
        intro.currentTime = 0;
        intro.volume = 0;
        
        try {
          await intro.play();
          
          // Fade in intro music
          const fadeInSteps = 10;
          const fadeInInterval = 50;
          const targetVolume = 1;
          const volumeIncrement = targetVolume / fadeInSteps;
          
          let fadeInIntervalId: NodeJS.Timeout | null = setInterval(() => {
            if (intro.volume < targetVolume - volumeIncrement) {
              intro.volume = Math.min(targetVolume, intro.volume + volumeIncrement);
            } else {
              intro.volume = targetVolume;
              if (fadeInIntervalId) {
                clearInterval(fadeInIntervalId);
                fadeInIntervalId = null;
              }
            }
          }, fadeInInterval);
          
          // Wait for metadata to get duration
          if (!intro.duration) {
            await new Promise<void>((resolve) => {
              intro.addEventListener("loadedmetadata", () => resolve(), { once: true });
            });
          }
          
          // Schedule fade out
          if (intro.duration && intro.duration > 2) {
            const fadeOutDuration = 2000;
            const fadeOutStart = Math.max(0, (intro.duration - fadeOutDuration / 1000) * 1000);
            
            setTimeout(() => {
              if (fadeInIntervalId) {
                clearInterval(fadeInIntervalId);
              }
              
              const fadeSteps = 20;
              const fadeInterval = fadeOutDuration / fadeSteps;
              const volumeDecrement = intro.volume / fadeSteps;
              
              let fadeOutIntervalId: NodeJS.Timeout | null = setInterval(() => {
                if (intro.volume > volumeDecrement) {
                  intro.volume = Math.max(0, intro.volume - volumeDecrement);
                } else {
                  intro.volume = 0;
                  intro.pause();
                  if (fadeOutIntervalId) {
                    clearInterval(fadeOutIntervalId);
                    fadeOutIntervalId = null;
                  }
                  setIsIntroPlaying(false);
                  
                  // After music fades out, move to next segment or finish
                  if (currentSegment < audioSegments.length - 1) {
                    setCurrentSegment(prev => prev + 1);
                    loadedAudioPathRef.current = null; // Clear so next segment loads
                  } else {
                    // All segments done - stop playback
                    setIsPlaying(false);
                    setCurrentSegment(0);
                    loadedAudioPathRef.current = null;
                    hasPlayedIntroRef.current = false; // Reset for next play
                  }
                }
              }, fadeInterval);
            }, fadeOutStart);
          }
        } catch (err) {
          console.error("Error playing intro music between segments:", err);
          // Fallback: just move to next segment
          setIsIntroPlaying(false);
          if (currentSegment < audioSegments.length - 1) {
            setCurrentSegment(prev => prev + 1);
            loadedAudioPathRef.current = null;
          } else {
            setIsPlaying(false);
            setCurrentSegment(0);
            loadedAudioPathRef.current = null;
            hasPlayedIntroRef.current = false; // Reset for next play
          }
        }
      };

      main.addEventListener("ended", handleEnded);

      return () => {
        main.removeEventListener("ended", handleEnded);
      };
    }
  }, [audioPath, currentReport, currentSegment, audioSegments]);

  useEffect(() => {
    if (isPlaying && !isIntroPlaying && mainAudioRef.current && mainAudioRef.current.paused) {
      mainAudioRef.current.volume = 1;
      mainAudioRef.current.play().catch(err => {
        console.error("Error auto-playing next segment:", err);
      });
    }
  }, [currentSegment, isPlaying, isIntroPlaying]);

  // Update progress bar while playing - calculate total time across all segments
  useEffect(() => {
    const updateProgress = () => {
      const main = mainAudioRef.current;
      if (main && !isIntroPlaying && segmentDurations.length > 0) {
        // Calculate elapsed time from previous segments
        const elapsedFromPreviousSegments = segmentDurations
          .slice(0, currentSegment)
          .reduce((sum, d) => sum + d, 0);
        
        // Add current position in current segment
        const totalElapsed = elapsedFromPreviousSegments + main.currentTime;
        setCurrentTime(totalElapsed);
      } else if (isIntroPlaying) {
        // During intro, show elapsed time from previous segments only
        const elapsedFromPreviousSegments = segmentDurations
          .slice(0, currentSegment)
          .reduce((sum, d) => sum + d, 0);
        setCurrentTime(elapsedFromPreviousSegments);
      }
    };

    if (isPlaying || isIntroPlaying) {
      const interval = setInterval(updateProgress, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying, isIntroPlaying, currentSegment, segmentDurations]);

  const handleSeek = (value: number[]) => {
    const main = mainAudioRef.current;
    if (!main || isIntroPlaying || segmentDurations.length === 0) return;
    
    const targetTime = value[0];
    let accumulatedTime = 0;
    let targetSegment = 0;
    let timeInSegment = 0;
    
    // Find which segment this time falls into
    for (let i = 0; i < segmentDurations.length; i++) {
      if (targetTime <= accumulatedTime + segmentDurations[i]) {
        targetSegment = i;
        timeInSegment = targetTime - accumulatedTime;
        break;
      }
      accumulatedTime += segmentDurations[i];
    }
    
    // Ensure targetSegment is within bounds
    targetSegment = Math.min(targetSegment, audioSegments.length - 1);
    targetSegment = Math.max(0, targetSegment);
    
    // Ensure timeInSegment doesn't exceed segment duration
    if (segmentDurations[targetSegment]) {
      timeInSegment = Math.min(timeInSegment, segmentDurations[targetSegment]);
    }
    
    // If seeking to a different segment, change segment
    if (targetSegment !== currentSegment) {
      setCurrentSegment(targetSegment);
      loadedAudioPathRef.current = null; // Force reload of new segment
      
      // Wait for new segment to load, then seek
      setTimeout(() => {
        if (mainAudioRef.current) {
          mainAudioRef.current.currentTime = timeInSegment;
          setCurrentTime(targetTime);
        }
      }, 100);
    } else {
      // Same segment, just seek within it
      main.currentTime = timeInSegment;
      setCurrentTime(targetTime);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = async () => {
    if (audioSegments.length === 0) return;

    const intro = introAudioRef.current;
    const main = mainAudioRef.current;

    if (!intro || !main) return;

    if (isPlaying) {
      // Clear any fade intervals
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }

      // Immediately stop both audio elements
      intro.pause();
      main.pause();
      
      console.log(`[AudioPlayer] Paused at ${main.currentTime.toFixed(1)}s`);
      
      // Remove any pending event listeners
      if (introEndedHandlerRef.current) {
        intro.removeEventListener("ended", introEndedHandlerRef.current);
        introEndedHandlerRef.current = null;
      }

      setIsPlaying(false);
      setIsIntroPlaying(false);
    } else {
      // Resuming playback
      setIsPlaying(true);
      
      // Check if we should play intro (first play) or resume main audio (resuming after pause)
      if (hasPlayedIntroRef.current) {
        // Resuming - skip intro and just resume main audio from current position
        console.log(`[AudioPlayer] Resuming playback from ${main.currentTime.toFixed(1)}s (skipping intro)`);
        setIsIntroPlaying(false);
        main.volume = 1;
        
        try {
          await main.play();
        } catch (err) {
          console.error("Error resuming main audio:", err);
          setIsPlaying(false);
        }
      } else {
        // First play - play intro music then main audio
        console.log("[AudioPlayer] First play - starting with intro music");
        setIsIntroPlaying(true);
        hasPlayedIntroRef.current = true; // Mark that we've played the intro

        intro.currentTime = 0;
        intro.volume = 0;
        
        try {
          await intro.play();

          const fadeInSteps = 10;
          const fadeInInterval = 50;
          const targetVolume = 1;
          const volumeIncrement = targetVolume / fadeInSteps;
          
          fadeIntervalRef.current = setInterval(() => {
            if (intro.volume < targetVolume - volumeIncrement) {
              intro.volume = Math.min(targetVolume, intro.volume + volumeIncrement);
            } else {
              intro.volume = targetVolume;
              if (fadeIntervalRef.current) {
                clearInterval(fadeIntervalRef.current);
                fadeIntervalRef.current = null;
              }
            }
          }, fadeInInterval);

          if (!intro.duration) {
            await new Promise<void>((resolve) => {
              intro.addEventListener("loadedmetadata", () => resolve(), { once: true });
            });
          }

          if (intro.duration && intro.duration > 2) {
            const fadeOutDuration = 2000;
            const fadeOutStart = Math.max(0, (intro.duration - fadeOutDuration / 1000) * 1000);
            
            setTimeout(() => {
              if (fadeIntervalRef.current) {
                clearInterval(fadeIntervalRef.current);
              }

              const fadeSteps = 20;
              const fadeInterval = fadeOutDuration / fadeSteps;
              const volumeDecrement = intro.volume / fadeSteps;

              fadeIntervalRef.current = setInterval(() => {
                if (intro.volume > volumeDecrement) {
                  intro.volume = Math.max(0, intro.volume - volumeDecrement);
                } else {
                  intro.volume = 0;
                  intro.pause();
                  if (fadeIntervalRef.current) {
                    clearInterval(fadeIntervalRef.current);
                    fadeIntervalRef.current = null;
                  }
                  setIsIntroPlaying(false);
                }
              }, fadeInterval);
            }, fadeOutStart);
          }

          // Remove any existing event listener before adding a new one
          if (introEndedHandlerRef.current) {
            intro.removeEventListener("ended", introEndedHandlerRef.current);
          }
          
          // Create and store the event handler
          introEndedHandlerRef.current = async () => {
            setIsIntroPlaying(false);
            if (!isPlayingRef.current) return;
            
            main.volume = 1;
            main.currentTime = 0; // Start main audio from beginning on first play
            
            try {
              await main.play();
            } catch (err) {
              console.error("Error playing main audio:", err);
              setIsPlaying(false);
            }
          };
          
          intro.addEventListener("ended", introEndedHandlerRef.current, { once: true });

        } catch (err) {
          console.error("Error playing intro audio:", err);
          setIsPlaying(false);
          setIsIntroPlaying(false);
        }
      }
    }
  };

  if (audioSegments.length === 0) {
    return (
      <Button
        className="w-full h-12"
        variant="secondary"
        disabled
        data-testid={testId}
      >
        Generating report...
      </Button>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Button
        className="w-full h-12 gap-3 text-base border-2 border-[#8B4513]"
        variant="default"
        onClick={handlePlayPause}
        data-testid={testId}
      >
        {isPlaying ? (
          <>
            <Pause className="h-5 w-5" />
            Pause Report
          </>
        ) : (
          <>
            <Play className="h-5 w-5" />
            Play Report
          </>
        )}
      </Button>
      
      <div className="w-full space-y-1">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSeek}
          disabled={isIntroPlaying || !duration}
          className="w-full"
          data-testid="audio-progress-slider"
        />
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
